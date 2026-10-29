import { describe, expect, it } from 'vitest'

import { categoriesSchema } from './category.ts'

describe('categoriesSchema', () => {
  it('accepts a default that fits each cardinality', () => {
    const categories = [
      { id: 'package-manager', question: 'Package manager?', cardinality: 'one', default: 'pnpm' },
      { id: 'orm', question: 'ORM?', cardinality: 'at-most-one', default: null },
      { id: 'styling', question: 'Styling?', cardinality: 'many', default: ['tailwind'] },
    ]

    expect(categoriesSchema.parse(categories)).toEqual(categories)
  })

  it('rejects no default for a category that needs exactly one plugin', () => {
    const categories = [{ id: 'package-manager', question: '?', cardinality: 'one', default: null }]

    expect(categoriesSchema.safeParse(categories).success).toBe(false)
  })

  it('rejects the same id twice', () => {
    const category = { id: 'orm', question: 'ORM?', cardinality: 'at-most-one', default: null }

    expect(categoriesSchema.safeParse([category, category]).success).toBe(false)
  })
})
