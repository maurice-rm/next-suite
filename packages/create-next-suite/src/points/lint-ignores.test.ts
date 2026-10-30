import { describe, expect, it } from 'vitest'

import { createLintIgnores } from './lint-ignores.ts'

describe('createLintIgnores', () => {
  it('keeps the globs in the order they were first given', () => {
    const ignores = createLintIgnores()
    ignores.ignore('drizzle/**', 'src/generated/**')
    ignores.ignore('drizzle/**')

    expect(ignores.globs()).toEqual(['drizzle/**', 'src/generated/**'])
  })
})
