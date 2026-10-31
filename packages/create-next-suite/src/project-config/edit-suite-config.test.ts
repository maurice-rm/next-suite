import { describe, expect, it } from 'vitest'

import { addPluginToConfig, disablePluginInConfig } from './edit-suite-config.ts'
import { ProjectConfigError } from './project-config-error.ts'

const CONFIG = [
  'import { defineSuiteConfig } from "create-next-suite/config";',
  '',
  'export default defineSuiteConfig({',
  '  project: { name: "my-app" },',
  '  // Your own plugins join these.',
  '  plugins: [',
  '    "pnpm",',
  '    "eslint", // the linter',
  '  ],',
  '  disable: [],',
  '  answers: {},',
  '});',
  '',
].join('\n')

describe('addPluginToConfig', () => {
  it('appends the plugin and keeps the rest of the file as it is', () => {
    expect(addPluginToConfig(CONFIG, { entry: 'pino', name: 'pino', answers: {} })).toBe(
      CONFIG.replace('    "eslint", // the linter\n', '    "eslint", // the linter\n    "pino",\n'),
    )
  })

  it('writes the answers to its options in the file’s quotes', () => {
    const config = CONFIG.replaceAll('"', "'").replace(
      "'create-next-suite/config'",
      "'create-next-suite/config'",
    )

    const edited = addPluginToConfig(config, {
      entry: 'github:acme/plugins/mail#v1',
      name: 'mail',
      answers: {
        provider: 'smtp',
        tracking: false,
        channels: ['email', 'sms'],
      },
    })

    expect(edited).toContain("    'github:acme/plugins/mail#v1',\n")
    expect(edited).toContain(
      "  answers: {\n    mail: { provider: 'smtp', tracking: false, channels: ['email', 'sms'] },\n  },",
    )
  })

  it('takes a disabled plugin out of disable', () => {
    const config = CONFIG.replace('disable: []', 'disable: ["seo", "knip"]')

    expect(addPluginToConfig(config, { entry: 'seo', name: 'seo', answers: {} })).toContain(
      'disable: ["knip"]',
    )
  })

  it('fails for a config whose default export is no object literal', () => {
    expect(() =>
      addPluginToConfig('export default makeConfig()\n', {
        entry: 'pino',
        name: 'pino',
        answers: {},
      }),
    ).toThrow(ProjectConfigError)
  })
})

describe('disablePluginInConfig', () => {
  it('adds the plugin to disable and drops its answers', () => {
    const config = CONFIG.replace(
      'answers: {}',
      'answers: {\n    mail: { provider: "smtp" },\n    pino: { level: "debug" },\n  }',
    )

    const edited = disablePluginInConfig(config, 'mail')

    expect(edited).toContain('disable: ["mail"]')
    expect(edited).toContain('answers: {\n    pino: { level: "debug" },\n  }')
  })

  it('creates disable where the config has none', () => {
    expect(disablePluginInConfig(CONFIG.replace('  disable: [],\n', ''), 'seo')).toContain(
      'disable: ["seo"]',
    )
  })
})
