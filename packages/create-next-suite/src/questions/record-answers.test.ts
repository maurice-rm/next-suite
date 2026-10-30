import { describe, expect, it } from 'vitest'
import { TEST_CATEGORIES, TEST_PLUGINS, TEST_QUESTIONS } from '../test-support/questions.ts'
import { BASE_SETTINGS } from './base-settings.ts'
import { buildQuestions } from './build-questions.ts'
import { recordAnswers } from './record-answers.ts'
import { resolveAnswers } from './resolve-answers.ts'
import { RUN_SETTINGS } from './run-settings.ts'

const resolveFrom = (input: Record<string, unknown>) =>
  resolveAnswers({ questions: TEST_QUESTIONS, input, useDefaults: false })

describe('recordAnswers', () => {
  it('records answers that resolve back to the same answers', () => {
    const input = {
      'package-manager': 'npm',
      'src-dir': true,
      'import-alias': '~/*',
      'react-compiler': false,
      'cache-components': true,
      orm: 'drizzle',
      'drizzle.casing': 'camel',
      styling: ['tailwind', 'sass'],
      seo: true,
      'seo.og-image': true,
      'better-auth': true,
    }
    const { answers, missing } = resolveFrom(input)

    const recorded = recordAnswers(TEST_QUESTIONS, answers)

    expect(missing).toEqual([])
    expect(recorded).toEqual(input)
    expect(resolveFrom(recorded).answers).toEqual(answers)
  })

  it('records an empty category as null or an empty list, an unselected extra as false', () => {
    const { answers } = resolveFrom({
      'package-manager': 'pnpm',
      'src-dir': false,
      'import-alias': '@/*',
      'react-compiler': false,
      'cache-components': true,
      orm: null,
      styling: [],
      seo: false,
      'better-auth': false,
    })

    const recorded = recordAnswers(TEST_QUESTIONS, answers)

    expect(recorded).toMatchObject({ orm: null, styling: [], seo: false, 'better-auth': false })
    expect(recorded).not.toHaveProperty(['drizzle.casing'])
    expect(recorded).not.toHaveProperty(['seo.og-image'])
    expect(resolveFrom(recorded).answers).toEqual(answers)
  })

  it('leaves out the settings of the run', () => {
    const questions = buildQuestions({
      categories: TEST_CATEGORIES,
      plugins: TEST_PLUGINS,
      settings: BASE_SETTINGS,
      runSettings: RUN_SETTINGS,
    })
    const { answers } = resolveAnswers({ questions, input: {}, useDefaults: true })

    const recorded = recordAnswers(questions, answers)

    expect(recorded).not.toHaveProperty('git')
    expect(recorded).not.toHaveProperty('install')
  })
})
