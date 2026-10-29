import { describe, expect, it } from 'vitest'

import { findIncompatibilities } from './find-incompatibilities.ts'
import { resolveAnswers } from './resolve-answers.ts'
import { TEST_PLUGINS, TEST_QUESTIONS } from './test-questions.ts'

const incompatibilities = (input: Record<string, unknown>): string[] =>
  findIncompatibilities(
    TEST_PLUGINS,
    resolveAnswers({ questions: TEST_QUESTIONS, input, useDefaults: true }).answers,
  )

describe('findIncompatibilities', () => {
  it('finds nothing for compatible answers', () => {
    expect(incompatibilities({ orm: 'drizzle', 'better-auth': true })).toEqual([])
  })

  it('names a requirement that does not hold, with the reason from the manifest', () => {
    expect(incompatibilities({ 'better-auth': true })).toEqual([
      'better-auth: Stores sessions in the database.',
    ])
  })

  it('names a conflict that holds', () => {
    expect(incompatibilities({ orm: 'prisma', 'better-auth': true })).toEqual([
      'better-auth: Not tested with Prisma.',
    ])
  })
})
