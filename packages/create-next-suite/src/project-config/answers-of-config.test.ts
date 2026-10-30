import { describe, expect, it } from 'vitest'

import type { Category } from '../plugin-definition/categories.ts'
import { definePlugin } from '../plugin-definition/define-plugin.ts'
import { answersOfConfig } from './answers-of-config.ts'
import type { SuiteConfig } from './suite-config.ts'

const CATEGORIES: Category[] = [
  {
    id: 'package-manager',
    question: 'Which package manager?',
    section: 'Project',
    cardinality: 'one',
    default: 'pnpm',
  },
  {
    id: 'styling',
    question: 'Which styling?',
    section: 'UI',
    cardinality: 'many',
    default: [],
  },
  {
    id: 'linter',
    question: 'Which linter?',
    section: 'Tooling',
    cardinality: 'at-most-one',
    default: 'eslint',
  },
]

const PLUGINS = [
  definePlugin({ name: 'pnpm', title: 'pnpm', category: 'package-manager' }),
  definePlugin({ name: 'tailwind', title: 'Tailwind', category: 'styling' }),
  definePlugin({ name: 'eslint', title: 'ESLint', category: 'linter' }),
  definePlugin({ name: 'biome', title: 'Biome', category: 'linter' }),
  definePlugin({
    name: 'pino',
    title: 'pino',
    options: {
      level: {
        question: 'Which level?',
        choices: ['debug', 'info'],
        default: 'info',
      },
    },
  }),
  definePlugin({ name: 'mail', title: 'Mail' }),
  definePlugin({ name: 'tweaks', title: 'Tweaks' }),
]

/** The external plugins of the config by the entry that names them. */
const NAMES_BY_ENTRY = new Map([
  ['github:acme/plugins/mail#v1', 'mail'],
  ['./next-suite/plugins/tweaks', 'tweaks'],
])

/** The config as a test writes it, with plugin names the registry of these tests does not know. */
const answersOf = (config: object) =>
  answersOfConfig(config as SuiteConfig, {
    plugins: PLUGINS,
    categories: CATEGORIES,
    nameOfEntry: (entry) => NAMES_BY_ENTRY.get(entry),
  })

describe('answersOfConfig', () => {
  it('answers every category, extra, option and setting the config states', () => {
    expect(
      answersOf({
        project: { name: 'my-app', srcDir: true, importAlias: '~/*' },
        plugins: ['pnpm', 'biome', 'pino', 'github:acme/plugins/mail#v1'],
        answers: { pino: { level: 'debug' } },
      }),
    ).toEqual({
      'package-manager': 'pnpm',
      styling: [],
      linter: 'biome',
      pino: true,
      mail: true,
      tweaks: false,
      'pino.level': 'debug',
      'src-dir': true,
      'import-alias': '~/*',
    })
  })

  it('leaves a category of exactly one plugin to its default when the config names none', () => {
    expect(answersOf({ project: { name: 'my-app' }, plugins: [] })).not.toHaveProperty(
      'package-manager',
    )
  })

  it('leaves out a disabled plugin', () => {
    const answers = answersOf({
      project: { name: 'my-app' },
      plugins: ['eslint', './next-suite/plugins/tweaks'],
      disable: ['eslint', 'tweaks'],
    })

    expect(answers).toMatchObject({ linter: null, tweaks: false })
  })

  it('fails for a plugin it does not know', () => {
    expect(() =>
      answersOf({
        project: { name: 'my-app' },
        plugins: ['pinot'],
      }),
    ).toThrow('next-suite.config.ts names the plugin "pinot", which is no built-in plugin')
  })

  it('fails for two plugins of a category that takes one', () => {
    expect(() =>
      answersOf({
        project: { name: 'my-app' },
        plugins: ['eslint', 'biome'],
      }),
    ).toThrow('next-suite.config.ts selects eslint and biome, but the category linter takes one')
  })

  it('fails for a disabled plugin it does not know and for answers to a plugin not selected', () => {
    expect(() =>
      answersOf({
        project: { name: 'my-app' },
        plugins: [],
        disable: ['pinot'],
      }),
    ).toThrow('next-suite.config.ts disables "pinot", which is no plugin')
    expect(() =>
      answersOf({
        project: { name: 'my-app' },
        plugins: [],
        answers: { pino: { level: 'debug' } },
      }),
    ).toThrow('next-suite.config.ts answers pino, which it does not select')
  })
})
