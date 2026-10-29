import { describe, expect, it } from 'vitest'

import { type ParsedPluginManifest, pluginManifestSchema } from '../contract/plugin-manifest.ts'
import { mergeContributions } from './merge-contributions.ts'

const manifest = (name: string, extra: object = {}): ParsedPluginManifest =>
  pluginManifestSchema.parse({
    name,
    version: '1.0.0',
    contract: '^1.0.0',
    title: name,
    description: name,
    ...extra,
  })

const CATALOG = { next: '16.4.3', react: '19.3.1' }

const variable = (name: string, description = 'A value.') => ({
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
        manifest('base', { dependencies: { react: 'catalog:react', next: 'catalog:next' } }),
        manifest('zod', { dependencies: { zod: '^4.6.0' } }),
      ],
      CATALOG,
    )

    expect(values.dependencies).toEqual({ next: '16.4.3', react: '19.3.1', zod: '^4.6.0' })
  })

  it('rejects a catalog name the catalog does not list', () => {
    expect(() =>
      mergeContributions([manifest('a', { dependencies: { x: 'catalog:x' } })], CATALOG),
    ).toThrow('a asks for catalog:x, which the version catalog does not list')
  })

  it('merges identical definitions and rejects different ones', () => {
    const scripts = (dev: string) => ({ contributes: { package: { scripts: { dev } } } })

    expect(
      mergeContributions(
        [manifest('a', scripts('next dev')), manifest('b', scripts('next dev'))],
        CATALOG,
      ).scripts,
    ).toEqual({ dev: 'next dev' })
    expect(() =>
      mergeContributions(
        [manifest('a', scripts('next dev')), manifest('b', scripts('vite'))],
        CATALOG,
      ),
    ).toThrow('a and b define the script "dev" differently')
  })

  it('rejects one package as both a dependency and a dev dependency', () => {
    expect(() =>
      mergeContributions(
        [
          manifest('a', { dependencies: { zod: '^4.0.0' } }),
          manifest('b', { devDependencies: { zod: '^4.0.0' } }),
        ],
        CATALOG,
      ),
    ).toThrow('"zod" is both a dependency and a dev dependency')
  })

  it('groups environment variables by plugin and rejects a name defined differently', () => {
    const values = mergeContributions(
      [manifest('db', { title: 'Database', env: [variable('DATABASE_URL')] })],
      CATALOG,
    )

    expect(values.env.groups).toEqual([
      { title: 'Database', variables: [variable('DATABASE_URL')] },
    ])
    expect(() =>
      mergeContributions(
        [
          manifest('a', { env: [variable('URL', 'One.')] }),
          manifest('b', { env: [variable('URL', 'Two.')] }),
        ],
        CATALOG,
      ),
    ).toThrow('a and b define the environment variable "URL" differently')
  })

  it('lists an environment variable two plugins define identically once', () => {
    const values = mergeContributions(
      [
        manifest('a', { env: [variable('URL')] }),
        manifest('b', { env: [variable('URL'), variable('KEY')] }),
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
      [manifest('a', { env: [variable('URL'), variable('URL')] })],
      CATALOG,
    )

    expect(values.env.groups[0]?.variables.map((entry) => entry.name)).toEqual(['URL'])
  })

  it('sorts dependencies by code unit, whatever the locale', () => {
    const values = mergeContributions(
      [manifest('a', { dependencies: { zod: '1', chalk: '1', aaa: '1', debug: '1' } })],
      CATALOG,
    )

    expect(Object.keys(values.dependencies)).toEqual(['aaa', 'chalk', 'debug', 'zod'])
  })

  it('collects gitignore patterns and readme sections in plugin order, without duplicate patterns', () => {
    const values = mergeContributions(
      [
        manifest('a', {
          contributes: {
            gitignore: ['.next', 'out'],
            readme: [{ section: 'Setup', text: 'Run it.' }],
          },
        }),
        manifest('b', {
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
        manifest('a', { contributes: { allowedBuilds: ['sharp', 'esbuild'] } }),
        manifest('b', { contributes: { allowedBuilds: ['@prisma/engines', 'sharp'] } }),
      ],
      CATALOG,
    )

    expect(values.allowedBuilds).toEqual(['@prisma/engines', 'esbuild', 'sharp'])
  })

  it('groups the lint-staged commands by glob, in plugin order and without duplicates', () => {
    const values = mergeContributions(
      [
        manifest('eslint', {
          contributes: { lintStaged: [{ glob: '*.ts', command: 'eslint --fix' }] },
        }),
        manifest('prettier', {
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
        manifest('logging', {
          env: [{ ...variable('LOG_LEVEL'), default: 'info' }, variable('LOG_TOKEN')],
        }),
        manifest('seo', {
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
        manifest('mdx', {
          contributes: {
            nextConfig: {
              wrappers: [{ import: "import createMDX from '@next/mdx'", call: 'withMDX' }],
            },
          },
        }),
        manifest('intl', {
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
        manifest('a', { contributes: { rootProviders: [provider('Theme')] } }),
        manifest('b', { contributes: { rootProviders: [provider('Query')] } }),
      ],
      CATALOG,
    )

    expect(values.rootProviders.opening.map((entry) => entry.component)).toEqual(['Theme', 'Query'])
    expect(values.rootProviders.closing).toEqual(['Query', 'Theme'])
  })
})
