import { describe, expect, it } from 'vitest'

import { categoriesSchema } from '../contract/category.ts'
import { pluginManifestSchema } from '../contract/plugin-manifest.ts'
import { TEST_QUESTIONS } from '../test-support/questions.ts'
import { buildQuestions } from './build-questions.ts'
import { resolveAnswers } from './resolve-answers.ts'

const resolve = (input: Record<string, unknown>, useDefaults = true) =>
  resolveAnswers({ questions: TEST_QUESTIONS, input, useDefaults })

describe('resolveAnswers', () => {
  it('takes every default with useDefaults', () => {
    expect(resolve({})).toEqual({
      answers: {
        plugins: [
          { name: 'pnpm', category: 'package-manager' },
          { name: 'tailwind', category: 'styling' },
          { name: 'seo', category: undefined },
        ],
        settings: {
          'src-dir': false,
          'import-alias': '@/*',
          'react-compiler': false,
          'cache-components': true,
        },
        options: { 'seo.og-image': false },
      },
      missing: [],
      unused: [],
    })
  })

  it('lets input win over defaults and asks the options of a newly selected plugin', () => {
    const { answers } = resolve({
      orm: 'drizzle',
      styling: ['tailwind', 'sass'],
      'seo.og-image': true,
    })

    expect(answers.plugins.map((plugin) => plugin.name)).toEqual([
      'pnpm',
      'drizzle',
      'tailwind',
      'sass',
      'seo',
    ])
    expect(answers.options).toEqual({
      'drizzle.casing': 'snake',
      'seo.og-image': true,
      'seo.og-title': 'My app',
    })
  })

  it('selects nothing for null in a category of at most one', () => {
    expect(resolve({ orm: null }).answers.plugins.map((plugin) => plugin.name)).toEqual([
      'pnpm',
      'tailwind',
      'seo',
    ])
  })

  it('leaves questions open without useDefaults and skips options of plugins not chosen yet', () => {
    const { missing } = resolve({ 'package-manager': 'npm' }, false)

    expect(missing.map((question) => question.key)).toEqual([
      'src-dir',
      'import-alias',
      'react-compiler',
      'cache-components',
      'orm',
      'styling',
      'seo',
      'better-auth',
    ])
  })

  it('reports input that no asked question used', () => {
    expect(resolve({ seo: false, 'seo.og-image': true, colour: 'blue' }).unused).toEqual([
      'seo.og-image',
      'colour',
    ])
  })

  it.each([
    ['package-manager', 'yarn', 'one of: pnpm, npm'],
    ['package-manager', null, 'one of: pnpm, npm'],
    ['styling', ['tailwind', 'tailwind'], 'a list of distinct plugins from: tailwind, sass'],
    ['seo', 'yes', 'true or false'],
    ['src-dir', 'no', 'true or false'],
    ['import-alias', 1, 'a string'],
    ['drizzle.casing', 'pascal', 'one of: snake, camel'],
  ])('rejects %s = %j', (key, value, expected) => {
    expect(() => resolve({ orm: 'drizzle', [key]: value })).toThrow(
      `the answer "${key}" is ${JSON.stringify(value)}; expected ${expected}`,
    )
  })

  it('leaves out a default plugin that does not fit, where the category allows none', () => {
    const plugin = (name: string, category: string, extra: object = {}) =>
      pluginManifestSchema.parse({
        name,
        version: '1.0.0',
        contract: '^1.0.0',
        title: name,
        description: name,
        category,
        ...extra,
      })
    const questions = buildQuestions({
      categories: categoriesSchema.parse([
        {
          section: 'Tooling',
          categories: [
            { id: 'linter', question: '?', cardinality: 'at-most-one', default: 'eslint' },
            { id: 'formatter', question: '?', cardinality: 'at-most-one', default: 'prettier' },
            { id: 'git-hooks', question: '?', cardinality: 'at-most-one', default: 'lint-staged' },
          ],
        },
      ]),
      plugins: [
        plugin('eslint', 'linter'),
        plugin('biome', 'linter'),
        plugin('prettier', 'formatter', {
          conflicts: [{ when: { plugin: 'biome' }, reason: 'Biome formats.' }],
        }),
        plugin('lint-staged', 'git-hooks', {
          requires: [{ when: { category: 'linter' }, reason: 'Runs the linter.' }],
        }),
      ],
      settings: [],
      runSettings: [],
    })

    const withBiome = resolveAnswers({ questions, input: { linter: 'biome' }, useDefaults: true })
    const withEslint = resolveAnswers({ questions, input: {}, useDefaults: true })
    const withoutLinter = resolveAnswers({ questions, input: { linter: null }, useDefaults: true })
    const namesOf = (resolution: typeof withBiome) =>
      resolution.answers.plugins.map((answer) => answer.name)

    expect(namesOf(withBiome)).toEqual(['biome', 'lint-staged'])
    expect(namesOf(withEslint)).toEqual(['eslint', 'prettier', 'lint-staged'])
    expect(namesOf(withoutLinter)).toEqual(['prettier'])
  })
})
