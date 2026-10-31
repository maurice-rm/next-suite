import { describe, expect, it } from 'vitest'

import { createTestSetup } from './test-setup.ts'

describe('createTestSetup', () => {
  it('keeps the setup files in the order they were first added', () => {
    const setup = createTestSetup()
    setup.add('vitest.setup.ts', 'msw.setup.ts')
    setup.add('vitest.setup.ts')

    expect(setup.paths()).toEqual(['vitest.setup.ts', 'msw.setup.ts'])
  })
})
