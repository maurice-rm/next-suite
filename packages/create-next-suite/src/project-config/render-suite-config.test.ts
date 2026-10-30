import { describe, expect, it } from 'vitest'

import { renderSuiteConfig } from './render-suite-config.ts'

const PROJECT = {
  name: 'my-app',
  srcDir: false,
  importAlias: '@/*',
  reactCompiler: false,
  cacheComponents: true,
}

describe('renderSuiteConfig', () => {
  it('writes the settings, every plugin entry and every answer', () => {
    expect(
      renderSuiteConfig({
        project: PROJECT,
        plugins: [
          'pnpm',
          'tailwind',
          'eslint',
          'prettier',
          'knip',
          'lint-staged',
          'vitest',
          'pino',
          'github:acme/plugins/mail#v1',
        ],
        answers: {
          pino: { level: 'info' },
          'agents-md': { tools: ['claude', 'codex'] },
        },
      }),
    ).toBe(
      [
        'import { defineSuiteConfig } from "create-next-suite/config";',
        '',
        'export default defineSuiteConfig({',
        '  project: {',
        '    name: "my-app",',
        '    srcDir: false,',
        '    importAlias: "@/*",',
        '    reactCompiler: false,',
        '    cacheComponents: true,',
        '  },',
        '  // Your own plugins join these: "./next-suite/plugins/<name>", an address such as',
        '  // "github:acme/plugins/mail#v1", or definePlugin({ … }) in place.',
        '  plugins: [',
        '    "pnpm",',
        '    "tailwind",',
        '    "eslint",',
        '    "prettier",',
        '    "knip",',
        '    "lint-staged",',
        '    "vitest",',
        '    "pino",',
        '    "github:acme/plugins/mail#v1",',
        '  ],',
        '  disable: [],',
        '  answers: {',
        '    pino: { level: "info" },',
        '    "agents-md": { tools: ["claude", "codex"] },',
        '  },',
        '  // extends: a shared config to start from; not supported yet.',
        '});',
        '',
      ].join('\n'),
    )
  })

  it('keeps a short plugin list on one line and leaves out plugins without options', () => {
    expect(
      renderSuiteConfig({ project: PROJECT, plugins: ['npm'], answers: { npm: {} } }),
    ).toContain('  plugins: ["npm"],\n  disable: [],\n  answers: {},\n')
  })
})
