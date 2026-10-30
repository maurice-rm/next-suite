import { describe, expect, it } from 'vitest'

import { logicResultSchema } from './logic.ts'

describe('logicResultSchema', () => {
  it('takes dependency versions from the catalog or as a semver range, like a manifest', () => {
    const result = {
      dependencies: { 'drizzle-orm': 'catalog:drizzle-orm' },
      devDependencies: { zod: '^4.6.0' },
    }

    expect(logicResultSchema.safeParse(result).success).toBe(true)
  })

  it('rejects a dependency version that is neither', () => {
    expect(logicResultSchema.safeParse({ dependencies: { zod: 'newest' } }).success).toBe(false)
  })
})
