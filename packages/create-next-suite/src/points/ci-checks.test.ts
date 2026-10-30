import { describe, expect, it } from 'vitest'

import { createCiChecks } from './ci-checks.ts'

describe('createCiChecks', () => {
  it('keeps the scripts in the order they were first given', () => {
    const checks = createCiChecks()
    checks.run('lint')
    checks.run('test')
    checks.run('lint')

    expect(checks.scripts()).toEqual(['lint', 'test'])
  })
})
