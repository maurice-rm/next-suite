import { describe, expect, it } from 'vitest'

import { TEST_QUESTIONS, testPlugin } from '../test-support/questions.ts'
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
        ],
        settings: {
          'src-dir': false,
          'import-alias': '@/*',
          'react-compiler': false,
          'cache-components': true,
        },
        options: {},
      },
      missing: [],
      unused: [],
    })
  })

  it('lets input win over defaults and asks the options of a newly selected plugin', () => {
    const { answers } = resolve({
      orm: 'drizzle',
      styling: ['tailwind', 'sass'],
      seo: true,
      'seo.og-image': true,
    })

    expect(answers.plugins.map((plugin) => plugin.name)).toEqual([
      'pnpm',
      'drizzle',
      'tailwind',
      'sass',
      'seo',
    ])
    expect(answers.options).toEqual({ 'drizzle.casing': 'snake', 'seo.og-image': true })
  })

  it('selects nothing for null in a category of at most one', () => {
    expect(resolve({ orm: null }).answers.plugins.map((plugin) => plugin.name)).toEqual([
      'pnpm',
      'tailwind',
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

  it('leaves out a default plugin that conflicts, where the category allows none', () => {
    const questions = buildQuestions({
      categories: [
        {
          id: 'linter',
          question: '?',
          section: 'Tooling',
          cardinality: 'at-most-one',
          default: 'eslint',
        },
        {
          id: 'formatter',
          question: '?',
          section: 'Tooling',
          cardinality: 'at-most-one',
          default: 'prettier',
        },
      ],
      plugins: [
        testPlugin('eslint', { category: 'linter' }),
        testPlugin('biome', { category: 'linter' }),
        testPlugin('prettier', { category: 'formatter', conflicts: { biome: 'Biome formats.' } }),
      ],
      settings: [],
      runSettings: [],
    })

    const withBiome = resolveAnswers({ questions, input: { linter: 'biome' }, useDefaults: true })
    const withEslint = resolveAnswers({ questions, input: {}, useDefaults: true })
    const namesOf = (resolution: typeof withBiome) =>
      resolution.answers.plugins.map((answer) => answer.name)

    expect(namesOf(withBiome)).toEqual(['biome'])
    expect(namesOf(withEslint)).toEqual(['eslint', 'prettier'])
  })

  it('leaves out a default plugin whose precondition fails on the whole selection, and keeps a met one', () => {
    const questions = buildQuestions({
      categories: [
        {
          id: 'linter',
          question: '?',
          section: 'Tooling',
          cardinality: 'at-most-one',
          default: 'eslint',
        },
        {
          id: 'git-hooks',
          question: '?',
          section: 'Tooling',
          cardinality: 'at-most-one',
          default: 'lint-staged',
        },
        { id: 'tests', question: '?', section: 'Tooling', cardinality: 'many', default: ['e2e'] },
      ],
      plugins: [
        testPlugin('eslint', { category: 'linter' }),
        testPlugin('lint-staged', {
          category: 'git-hooks',
          precondition: ({ hasCategory }) => hasCategory('linter') || 'Runs the linter.',
        }),
        testPlugin('e2e', {
          category: 'tests',
          precondition: ({ has }) => has('lint-staged') || 'Runs before each commit.',
        }),
      ],
      settings: [],
      runSettings: [],
    })
    const namesOf = (input: Record<string, unknown>) =>
      resolveAnswers({ questions, input, useDefaults: true }).answers.plugins.map(
        (answer) => answer.name,
      )

    expect(namesOf({})).toEqual(['eslint', 'lint-staged', 'e2e'])
    expect(namesOf({ linter: null })).toEqual([])
    expect(namesOf({ linter: null, 'git-hooks': 'lint-staged' })).toEqual(['lint-staged', 'e2e'])
  })
})
