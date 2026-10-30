import { describe, expect, it } from 'vitest'

import type { PluginManifest } from '../contract/plugin-manifest.ts'
import { parseTestManifest } from '../test-support/test-manifest.ts'
import { mergeContributions } from './merge-contributions.ts'

const CATALOG = { next: '16.4.3', react: '19.3.1' }

type EnvVariable = NonNullable<PluginManifest['env']>[number]

const variable = (name: string, description = 'A value.'): EnvVariable => ({
  name,
  scope: 'server',
  secret: false,
  example: '',
  description,
})

describe('mergeContributions', () => {
  it('resolves catalog versions and sorts the dependencies', () => {
    const values = mergeContributions(
      [
        parseTestManifest('base', {
          dependencies: { react: 'catalog:react', next: 'catalog:next' },
        }),
        parseTestManifest('zod', { dependencies: { zod: '^4.6.0' } }),
      ],
      CATALOG,
    )

    expect(values.dependencies).toEqual({ next: '16.4.3', react: '19.3.1', zod: '^4.6.0' })
  })

  it('rejects a catalog name the catalog does not list', () => {
    expect(() =>
      mergeContributions([parseTestManifest('a', { dependencies: { x: 'catalog:x' } })], CATALOG),
    ).toThrow('a asks for catalog:x, which the version catalog does not list')
  })

  it('merges identical definitions and rejects different ones', () => {
    const scripts = (dev: string) => ({ contributes: { package: { scripts: { dev } } } })

    expect(
      mergeContributions(
        [parseTestManifest('a', scripts('next dev')), parseTestManifest('b', scripts('next dev'))],
        CATALOG,
      ).scripts,
    ).toEqual({ dev: 'next dev' })
    expect(() =>
      mergeContributions(
        [parseTestManifest('a', scripts('next dev')), parseTestManifest('b', scripts('vite'))],
        CATALOG,
      ),
    ).toThrow('a and b define the script "dev" differently')
  })

  it('rejects one package as both a dependency and a dev dependency', () => {
    expect(() =>
      mergeContributions(
        [
          parseTestManifest('a', { dependencies: { zod: '^4.0.0' } }),
          parseTestManifest('b', { devDependencies: { zod: '^4.0.0' } }),
        ],
        CATALOG,
      ),
    ).toThrow('"zod" is both a dependency and a dev dependency')
  })

  it('groups environment variables by plugin and rejects a name defined differently', () => {
    const values = mergeContributions(
      [parseTestManifest('db', { title: 'Database', env: [variable('DATABASE_URL')] })],
      CATALOG,
    )

    expect(values.env.groups).toEqual([
      { title: 'Database', variables: [variable('DATABASE_URL')] },
    ])
    expect(() =>
      mergeContributions(
        [
          parseTestManifest('a', { env: [variable('URL', 'One.')] }),
          parseTestManifest('b', { env: [variable('URL', 'Two.')] }),
        ],
        CATALOG,
      ),
    ).toThrow('a and b define the environment variable "URL" differently')
  })

  it('lists an environment variable two plugins define identically once', () => {
    const values = mergeContributions(
      [
        parseTestManifest('a', { env: [variable('URL')] }),
        parseTestManifest('b', { env: [variable('URL'), variable('KEY')] }),
      ],
      CATALOG,
    )

    expect(values.env.groups.map((group) => group.variables.map((entry) => entry.name))).toEqual([
      ['URL'],
      ['KEY'],
    ])
  })

  it('lists an environment variable a plugin repeats once', () => {
    const values = mergeContributions(
      [parseTestManifest('a', { env: [variable('URL'), variable('URL')] })],
      CATALOG,
    )

    expect(values.env.groups[0]?.variables.map((entry) => entry.name)).toEqual(['URL'])
  })

  it('sorts dependencies by code unit, whatever the locale', () => {
    const values = mergeContributions(
      [parseTestManifest('a', { dependencies: { zod: '1', chalk: '1', aaa: '1', debug: '1' } })],
      CATALOG,
    )

    expect(Object.keys(values.dependencies)).toEqual(['aaa', 'chalk', 'debug', 'zod'])
  })

  it('collects gitignore patterns and readme sections in plugin order, without duplicate patterns', () => {
    const values = mergeContributions(
      [
        parseTestManifest('a', {
          contributes: {
            gitignore: ['.next', 'out'],
            readme: [{ section: 'Setup', text: 'Run it.' }],
          },
        }),
        parseTestManifest('b', {
          contributes: {
            gitignore: ['out', 'coverage'],
            readme: [{ section: 'Tests', text: 'Test it.' }],
          },
        }),
      ],
      CATALOG,
    )

    expect(values.gitignore).toEqual(['.next', 'out', 'coverage'])
    expect(values.readme.sections.map((entry) => entry.section)).toEqual(['Setup', 'Tests'])
  })

  it('collects the allowed builds of all plugins once, sorted by name', () => {
    const values = mergeContributions(
      [
        parseTestManifest('a', { contributes: { allowedBuilds: ['sharp', 'esbuild'] } }),
        parseTestManifest('b', { contributes: { allowedBuilds: ['@prisma/engines', 'sharp'] } }),
      ],
      CATALOG,
    )

    expect(values.allowedBuilds).toEqual(['@prisma/engines', 'esbuild', 'sharp'])
  })

  it('groups the lint-staged commands by glob, in plugin order and without duplicates', () => {
    const values = mergeContributions(
      [
        parseTestManifest('eslint', {
          contributes: { lintStaged: [{ glob: '*.ts', command: 'eslint --fix' }] },
        }),
        parseTestManifest('prettier', {
          contributes: {
            lintStaged: [
              { glob: '*', command: 'prettier --write' },
              { glob: '*.ts', command: 'eslint --fix' },
            ],
          },
        }),
      ],
      CATALOG,
    )

    expect(values.lintStaged).toEqual([
      { glob: '*.ts', commands: ['eslint --fix'] },
      { glob: '*', commands: ['prettier --write'] },
    ])
  })

  it('lists the variables by scope with their schema, and the layout metadata', () => {
    const values = mergeContributions(
      [
        parseTestManifest('logging', {
          env: [{ ...variable('LOG_LEVEL'), default: 'info' }, variable('LOG_TOKEN')],
        }),
        parseTestManifest('seo', {
          env: [{ ...variable('NEXT_PUBLIC_SITE_URL'), scope: 'client' }],
          contributes: { layoutMetadata: [{ key: 'metadataBase', value: 'new URL("x")' }] },
        }),
      ],
      CATALOG,
    )

    expect(values.env.server).toEqual([
      { name: 'LOG_LEVEL', schema: 'z.string().default("info")' },
      { name: 'LOG_TOKEN', schema: 'z.string()' },
    ])
    expect(values.env.client).toEqual([{ name: 'NEXT_PUBLIC_SITE_URL', schema: 'z.string()' }])
    expect(values.layoutMetadata).toEqual([{ key: 'metadataBase', value: 'new URL("x")' }])
  })

  it('wraps the next.config export in plugin order and imports every wrapper', () => {
    const values = mergeContributions(
      [
        parseTestManifest('mdx', {
          contributes: {
            nextConfig: {
              wrappers: [{ import: "import createMDX from '@next/mdx'", call: 'withMDX' }],
            },
          },
        }),
        parseTestManifest('intl', {
          contributes: {
            nextConfig: {
              wrappers: [
                {
                  import: "import createNextIntlPlugin from 'next-intl/plugin'",
                  call: 'withNextIntl',
                },
              ],
              options: [{ key: 'poweredByHeader', value: 'false' }],
            },
          },
        }),
      ],
      CATALOG,
    )

    expect(values.nextConfig).toEqual({
      imports: [
        "import createMDX from '@next/mdx'",
        "import createNextIntlPlugin from 'next-intl/plugin'",
      ],
      options: [{ key: 'poweredByHeader', value: 'false' }],
      exported: 'withNextIntl(withMDX(nextConfig))',
    })
  })

  it('opens root providers in plugin order and closes them in reverse', () => {
    const provider = (component: string) => ({
      import: `import { ${component} } from './${component}'`,
      component,
    })
    const values = mergeContributions(
      [
        parseTestManifest('a', { contributes: { rootProviders: [provider('Theme')] } }),
        parseTestManifest('b', { contributes: { rootProviders: [provider('Query')] } }),
      ],
      CATALOG,
    )

    expect(values.rootProviders.opening.map((entry) => entry.component)).toEqual(['Theme', 'Query'])
    expect(values.rootProviders.closing).toEqual(['Query', 'Theme'])
  })
})
