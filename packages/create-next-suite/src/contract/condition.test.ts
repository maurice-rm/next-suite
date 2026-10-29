import { describe, expect, it } from 'vitest'

import { conditionSchema } from './condition.ts'

describe('conditionSchema', () => {
  it('accepts every kind of condition, nested', () => {
    const condition = {
      all: [
        { plugin: 'drizzle' },
        { any: [{ category: 'api' }, { category: 'auth' }] },
        { not: { setting: 'src-dir', equals: true } },
        { option: 'seo.og-image', equals: true },
        { option: '@acme/auth.provider', in: ['github', 'gitlab'] },
      ],
    }

    expect(conditionSchema.parse(condition)).toEqual(condition)
  })

  it('rejects a condition that mixes two kinds in one object', () => {
    expect(conditionSchema.safeParse({ plugin: 'drizzle', category: 'orm' }).success).toBe(false)
  })

  it('rejects an empty group', () => {
    expect(conditionSchema.safeParse({ any: [] }).success).toBe(false)
  })
})
