import { describe, expect, it } from 'vitest'
import { TEST_QUESTIONS } from '../test-support/questions.ts'
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
})
