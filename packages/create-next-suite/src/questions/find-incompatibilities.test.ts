import { describe, expect, it } from 'vitest'
import { TEST_PLUGINS, TEST_QUESTIONS } from '../test-support/questions.ts'
import { findConflicts } from './find-incompatibilities.ts'
import { resolveAnswers } from './resolve-answers.ts'

const conflicts = (input: Record<string, unknown>): string[] =>
  findConflicts(
    TEST_PLUGINS,
    resolveAnswers({ questions: TEST_QUESTIONS, input, useDefaults: true }).answers,
  )

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
