import { describe, expect, it } from 'vitest'

import { findUnsupportedVersion } from './supported-versions.ts'

describe('findUnsupportedVersion', () => {
  it('rejects Yarn 1 with the way to Yarn 4', () => {
    expect(findUnsupportedVersion({ name: 'yarn', version: '1.22.22' })).toMatch(/Corepack/)
    expect(findUnsupportedVersion({ name: 'yarn', version: '4.18.1' })).toBeUndefined()
    expect(findUnsupportedVersion({ name: 'pnpm', version: '1.0.0' })).toBeUndefined()
  })
})
