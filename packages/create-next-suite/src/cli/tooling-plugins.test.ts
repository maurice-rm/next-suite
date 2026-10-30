import { fileURLToPath } from 'node:url'

import { beforeAll, describe, expect, it } from 'vitest'

import { assembleProject } from '../assembly/assemble-project.ts'
import { loadBaseProject } from '../loader/load-base-project.ts'
import { loadGroupedPluginModules } from '../loader/load-grouped-plugin-modules.ts'
import type { LoadedPluginModule } from '../loader/load-plugin-module.ts'
import { CATEGORIES } from '../plugin-definition/categories.ts'
import type { Plugin } from '../plugin-definition/plugin-definition.ts'
import { createProject } from '../project-model/project.ts'

const PACKAGE_ROOT = new URL('../../', import.meta.url)
const PLUGIN_ENTRY = fileURLToPath(new URL('../plugin.ts', import.meta.url))

type LintIgnores = { ignore: (...globs: string[]) => void }
type KnipOptions = {
  entry: (...files: string[]) => void
  ignoreDependencies: (...names: string[]) => void
}
type PrettierPlugins = { add: (name: string) => void }
type LintStagedCommands = { run: (glob: string, command: string) => void }

/**
 * An extra that contributes to the points of the tooling plugins, the way vitest, tailwind or an
 * ORM will; written as the core runs it, since the points of built-in plugins are typed only for
 * plugins.
 */
const CONTRIBUTOR: Plugin = {
  name: 'contributor',
  title: 'Contributor',
  generatedDirectories: ['@/generated'],
  extend: {
    lintIgnores: (ignores) => (ignores as LintIgnores).ignore('drizzle/**'),
    knip: (collector) => {
      const knip = collector as KnipOptions
      knip.entry('drizzle.config.ts', 'vitest.setup.ts')
      knip.ignoreDependencies('pino-pretty')
    },
    prettierPlugins: (plugins) => (plugins as PrettierPlugins).add('prettier-plugin-tailwindcss'),
    lintStaged: (lintStaged) => (lintStaged as LintStagedCommands).run('*.css', 'stylelint --fix'),
  },
}

let builtIn: LoadedPluginModule[]
let baseFiles: Map<string, string>

const assembleWith = (names: readonly string[]): Map<string, string> => {
  const plugins = [
    ...names.map((name) => {
      const found = builtIn.find(({ plugin }) => plugin.name === name)
      if (found === undefined) {
        throw new Error(`no built-in plugin ${name}`)
      }
      return found
    }),
    { plugin: CONTRIBUTOR, readFile: () => '' },
  ]
  return assembleProject({
    project: createProject({ files: baseFiles, settings: { alias: '@/*', isSrcDirectory: true } }),
    plugins,
    categoryOrder: CATEGORIES.map(({ id }) => id),
  }).files
}

const fileOf = (files: ReadonlyMap<string, string>, path: string): string => {
  const text = files.get(path)
  if (text === undefined) {
    throw new Error(`no ${path}`)
  }
  return text
}

beforeAll(async () => {
  builtIn = await loadGroupedPluginModules(
    fileURLToPath(new URL('plugins', PACKAGE_ROOT)),
    PLUGIN_ENTRY,
  )
  baseFiles = await loadBaseProject(fileURLToPath(new URL('base', PACKAGE_ROOT)))
})

describe('the tooling plugins', () => {
  it('write what other plugins contribute into their configs, as the templates did', () => {
    const files = assembleWith(['pnpm', 'eslint', 'prettier', 'knip', 'lint-staged'])

    expect(fileOf(files, 'eslint.config.mjs')).toContain(
      '    "next-env.d.ts",\n    "drizzle/**",\n    "src/generated/**",\n  ]),\n',
    )
    expect(fileOf(files, 'knip.config.ts')).toBe(
      [
        'import type { KnipConfig } from "knip";',
        '',
        'const config: KnipConfig = {',
        '  entry: [',
        '    "drizzle.config.ts",',
        '    "vitest.setup.ts",',
        '  ],',
        '  ignore: [',
        '    "src/generated/**",',
        '  ],',
        '  ignoreDependencies: [',
        '    "pino-pretty",',
        '  ],',
        '};',
        '',
        'export default config;',
        '',
      ].join('\n'),
    )
    expect(fileOf(files, 'prettier.config.mjs')).toContain(
      '  plugins: ["prettier-plugin-tailwindcss", ],\n',
    )
    expect(fileOf(files, 'lint-staged.config.mjs')).toContain(
      [
        'const config = {',
        '  "*.{js,jsx,mjs,cjs,ts,tsx}": ["eslint --fix", ],',
        '  "*": ["prettier --write --ignore-unknown", ],',
        '  "*.css": ["stylelint --fix", ],',
        '};',
      ].join('\n'),
    )
    expect(fileOf(files, '.gitignore')).toMatch(/\n\/src\/generated\n$/)
  })

  it('let Biome skip the ignored globs before its own', () => {
    const files = assembleWith(['pnpm', 'biome', 'knip'])

    expect(fileOf(files, 'biome.json')).toContain(
      '"includes": ["**", "!drizzle/**", "!src/generated/**", "!node_modules",',
    )
  })

  it('refuses lint-staged without a linter or a formatter to run', () => {
    const plugins = ['pnpm', 'knip', 'lint-staged'].map((name) => {
      const found = builtIn.find(({ plugin }) => plugin.name === name)
      if (found === undefined) {
        throw new Error(`no built-in plugin ${name}`)
      }
      return found
    })

    expect(() =>
      assembleProject({
        project: createProject({
          files: baseFiles,
          settings: { alias: '@/*', isSrcDirectory: false },
        }),
        plugins,
        categoryOrder: CATEGORIES.map(({ id }) => id),
      }),
    ).toThrow('lint-staged cannot run: it needs a linter or a formatter to run on the staged files')
  })

  it('refuses Prettier together with Biome', () => {
    expect(() => assembleWith(['pnpm', 'biome', 'prettier'])).toThrow(
      'prettier conflicts with biome: Biome formats the code already.',
    )
  })
})
