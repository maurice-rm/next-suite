import { describe, expect, it } from 'vitest'

import { categoriesSchema } from './category.ts'

const ORM = { id: 'orm', question: 'ORM?', cardinality: 'at-most-one', default: null }

describe('categoriesSchema', () => {
  it('gives each category the section it is grouped in, in file order', () => {
    const sections = [
      {
        section: 'Project',
        categories: [
          {
            id: 'package-manager',
            question: 'Package manager?',
            cardinality: 'one',
            default: 'pnpm',
          },
        ],
      },
      {
        section: 'Data',
        categories: [
          ORM,
          { id: 'styling', question: 'Styling?', cardinality: 'many', default: ['tailwind'] },
        ],
      },
    ]

    expect(
      categoriesSchema.parse(sections).map((category) => [category.id, category.section]),
    ).toEqual([
      ['package-manager', 'Project'],
      ['orm', 'Data'],
      ['styling', 'Data'],
    ])
  })

  it('rejects no default for a category that needs exactly one plugin', () => {
    const category = { id: 'package-manager', question: '?', cardinality: 'one', default: null }

    expect(
      categoriesSchema.safeParse([{ section: 'Project', categories: [category] }]).success,
    ).toBe(false)
  })

  it('rejects the same id twice, also across sections', () => {
    const sections = [
      { section: 'Data', categories: [ORM] },
      { section: 'More', categories: [ORM] },
    ]

    expect(categoriesSchema.safeParse(sections).success).toBe(false)
  })

  it('rejects the same section twice and a section without categories', () => {
    const twice = [
      { section: 'Data', categories: [ORM] },
      { section: 'Data', categories: [{ ...ORM, id: 'database' }] },
    ]

    expect(categoriesSchema.safeParse(twice).success).toBe(false)
    expect(categoriesSchema.safeParse([{ section: 'Data', categories: [] }]).success).toBe(false)
  })
})
