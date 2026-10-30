import { describe, expect, it } from 'vitest'

import { findNodeVersionProblem } from './find-node-version-problem.ts'

describe('findNodeVersionProblem', () => {
  it('accepts a version in the range and names the required one otherwise', () => {
    expect(
      findNodeVersionProblem({
        command: 'create-next-suite',
        current: '24.12.0',
        required: '>=24.12',
      }),
    ).toBeUndefined()
    expect(
      findNodeVersionProblem({
        command: 'create-next-suite',
        current: '27.0.0-alpha.0',
        required: '>=24.12',
      }),
    ).toBeUndefined()
    expect(
      findNodeVersionProblem({
        command: 'create-next-suite',
        current: '22.11.0',
        required: '>=24.12',
      }),
    ).toBe(
      'create-next-suite needs Node >=24.12 — you are on v22.11.0. Please upgrade Node and try again.',
    )
  })
})
