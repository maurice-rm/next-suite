import { describe, expect, it } from 'vitest'

import { findNodeVersionProblem } from './check-node-version.ts'

describe('findNodeVersionProblem', () => {
  it('accepts a version in the range and names the required one otherwise', () => {
    expect(findNodeVersionProblem('24.12.0', '>=24.12')).toBeUndefined()
    expect(findNodeVersionProblem('22.11.0', '>=24.12')).toBe(
      'create-next-suite needs Node >=24.12 — you are on v22.11.0. Please upgrade Node and try again.',
    )
  })
})
