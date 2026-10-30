import { describe, expect, it } from 'vitest'

import type { Category } from '../contract/category.ts'
import { preferPackageManager } from './prefer-package-manager.ts'

const CATEGORIES: Category[] = [
  {
    id: 'package-manager',
    question: 'Which package manager?',
    section: 'Project',
    cardinality: 'one',
    default: 'pnpm',
  },
  { id: 'orm', question: 'Which ORM?', section: 'Data', cardinality: 'at-most-one', default: null },
]

const defaultOf = (categories: Category[]) => categories[0]?.default

describe('preferPackageManager', () => {
  it('makes the package manager the default of its question only', () => {
    const categories = preferPackageManager(CATEGORIES, 'npm')

    expect(defaultOf(categories)).toBe('npm')
    expect(categories[1]).toEqual(CATEGORIES[1])
  })

  it('keeps the default without a package manager', () => {
    expect(defaultOf(preferPackageManager(CATEGORIES, undefined))).toBe('pnpm')
  })
})
