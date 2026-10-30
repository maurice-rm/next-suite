import { describe, expectTypeOf, it } from 'vitest'

import { definePlugin, defineSuiteConfig, type PluginName, type SuiteConfig } from './config.ts'

declare module './project-config/suite-config.ts' {
  interface PluginRegistry {
    pnpm: Record<never, never>
    pino: { level: 'debug' | 'info' }
    'vercel-analytics': Record<never, never>
    lint: { rules: readonly ('strict' | 'loose')[]; isFast: boolean }
  }
}

const PROJECT = { name: 'my-app' }

describe('create-next-suite/config', () => {
  it('knows the plugins of the registry by name', () => {
    expectTypeOf<PluginName>().toEqualTypeOf<'pnpm' | 'pino' | 'vercel-analytics' | 'lint'>()
  })

  it('answers the config it is given', () => {
    const config = defineSuiteConfig({
      project: PROJECT,
      plugins: ['pnpm', 'pino'],
      disable: ['vercel-analytics'],
      answers: {
        pino: { level: 'debug' },
        lint: { rules: ['strict'], isFast: true },
      },
    })

    expectTypeOf(config).toEqualTypeOf<SuiteConfig>()
  })

  it('takes the project settings of the base project', () => {
    defineSuiteConfig({
      project: {
        name: 'my-app',
        srcDir: true,
        importAlias: '~/*',
        reactCompiler: true,
        cacheComponents: false,
      },
      plugins: [],
    })
  })

  it('takes project plugins, external addresses and plugins defined in place', () => {
    defineSuiteConfig({
      project: PROJECT,
      plugins: [
        './next-suite/plugins/tweaks',
        '../shared/plugin',
        'npm:next-suite-plugin-mail@^1',
        'github:acme/plugins/mail#v1',
        'gitlab:group/repo',
        'git+https://host/repo.git#main',
        'https://host/mail.tgz',
        '@acme/mail',
        definePlugin({ name: 'site-url', title: 'Site URL' }),
      ],
    })
  })

  it('rejects a misspelled plugin name in the plugin list', () => {
    defineSuiteConfig({
      project: PROJECT,
      // @ts-expect-error pinot is no plugin and no address
      plugins: ['pinot'],
    })
  })

  it('rejects a misspelled plugin name in disable', () => {
    defineSuiteConfig({
      project: PROJECT,
      plugins: [],
      // @ts-expect-error vercel-analytcs is no plugin
      disable: ['vercel-analytcs'],
    })
  })

  it('rejects an answer that is none of the choices', () => {
    defineSuiteConfig({
      project: PROJECT,
      plugins: ['pino'],
      // @ts-expect-error verbose is not a level
      answers: { pino: { level: 'verbose' } },
    })
  })

  it('rejects answers to a plugin without options and to an unknown plugin', () => {
    defineSuiteConfig({
      project: PROJECT,
      plugins: [],
      answers: {
        // @ts-expect-error vercel-analytics asks nothing
        'vercel-analytics': { level: 'debug' },
      },
    })
    defineSuiteConfig({
      project: PROJECT,
      plugins: [],
      answers: {
        // @ts-expect-error pinot is no plugin
        pinot: { level: 'debug' },
      },
    })
  })

  it('rejects an unknown project setting', () => {
    defineSuiteConfig({
      // @ts-expect-error srcDirectory is no setting
      project: { name: 'my-app', srcDirectory: true },
      plugins: [],
    })
  })
})
