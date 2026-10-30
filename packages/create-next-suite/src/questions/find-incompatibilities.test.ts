import { describe, expect, it } from 'vitest'
import { TEST_PLUGINS, TEST_QUESTIONS } from '../test-support/questions.ts'
import { findConflicts, findIncompatibilities } from './find-incompatibilities.ts'
import { resolveAnswers } from './resolve-answers.ts'

const conflicts = (input: Record<string, unknown>): string[] =>
  findConflicts(
    TEST_PLUGINS,
    resolveAnswers({ questions: TEST_QUESTIONS, input, useDefaults: true }).answers,
  )

describe('findIncompatibilities', () => {
  it('names an unmet precondition and a conflict of a selected plugin, with its reasons', () => {
    const answers = resolveAnswers({
      questions: TEST_QUESTIONS,
      input: { orm: 'prisma', 'better-auth': true },
      useDefaults: true,
    }).answers
    const withoutOrm = resolveAnswers({
      questions: TEST_QUESTIONS,
      input: { 'better-auth': true },
      useDefaults: true,
    }).answers

    expect(findIncompatibilities(TEST_PLUGINS, answers)).toEqual([
      'better-auth: Not tested with Prisma.',
    ])
    expect(findIncompatibilities(TEST_PLUGINS, withoutOrm)).toEqual([
      'better-auth: Stores sessions in the database.',
    ])
  })
})

describe('findConflicts', () => {
  it('finds nothing for compatible answers', () => {
    expect(conflicts({ orm: 'drizzle', 'better-auth': true })).toEqual([])
  })

  it('names a conflict with a selected plugin, with the reason the plugin gives', () => {
    expect(conflicts({ orm: 'prisma', 'better-auth': true })).toEqual([
      'better-auth: Not tested with Prisma.',
    ])
  })
})
