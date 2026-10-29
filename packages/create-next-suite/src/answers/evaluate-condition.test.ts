import { describe, expect, it } from 'vitest'

import type { Answers } from './answers.ts'
import { evaluateCondition } from './evaluate-condition.ts'

const ANSWERS: Answers = {
  plugins: [
    { name: 'pnpm', category: 'package-manager' },
    { name: 'drizzle', category: 'orm' },
    { name: 'seo', category: undefined },
  ],
  settings: { 'src-dir': false, 'import-alias': '@/*' },
  options: { 'seo.og-image': true, 'seo.schemas': ['article', 'event'] },
}

describe('evaluateCondition', () => {
  it('holds for a selected plugin and not for another', () => {
    expect(evaluateCondition({ plugin: 'drizzle' }, ANSWERS)).toBe(true)
    expect(evaluateCondition({ plugin: 'prisma' }, ANSWERS)).toBe(false)
  })

  it('holds when any plugin of the category is selected', () => {
    expect(evaluateCondition({ category: 'orm' }, ANSWERS)).toBe(true)
    expect(evaluateCondition({ category: 'auth' }, ANSWERS)).toBe(false)
  })

  it('compares a setting with a value', () => {
    expect(evaluateCondition({ setting: 'src-dir', equals: false }, ANSWERS)).toBe(true)
    expect(evaluateCondition({ setting: 'src-dir', equals: true }, ANSWERS)).toBe(false)
  })

  it('compares an option with one value or a list of values', () => {
    expect(evaluateCondition({ option: 'seo.og-image', equals: true }, ANSWERS)).toBe(true)
    expect(evaluateCondition({ option: 'seo.og-image', in: [false] }, ANSWERS)).toBe(false)
  })

  it('matches a multiselect answer that contains the value', () => {
    expect(evaluateCondition({ option: 'seo.schemas', equals: 'event' }, ANSWERS)).toBe(true)
    expect(evaluateCondition({ option: 'seo.schemas', in: ['product', 'article'] }, ANSWERS)).toBe(
      true,
    )
    expect(evaluateCondition({ option: 'seo.schemas', equals: 'product' }, ANSWERS)).toBe(false)
  })

  it('matches no value for an option without an answer', () => {
    expect(evaluateCondition({ option: 'resend.sender', equals: '' }, ANSWERS)).toBe(false)
  })

  it('combines conditions with all, any and not', () => {
    const condition = {
      all: [{ any: [{ plugin: 'prisma' }, { plugin: 'drizzle' }] }, { not: { category: 'auth' } }],
    }

    expect(evaluateCondition(condition, ANSWERS)).toBe(true)
    expect(evaluateCondition({ not: condition }, ANSWERS)).toBe(false)
  })
})
