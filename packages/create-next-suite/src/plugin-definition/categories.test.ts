import { readFile } from 'node:fs/promises'

import { describe, expect, it } from 'vitest'

import { CATEGORIES } from './categories.ts'

const CATEGORIES_FILE = new URL('../../categories.json', import.meta.url)

type ListedSection = { section: string; categories: Record<string, unknown>[] }

describe('CATEGORIES', () => {
  it('lists the categories of categories.json, each with its section, in its order', async () => {
    const sections: ListedSection[] = JSON.parse(await readFile(CATEGORIES_FILE, 'utf8'))

    expect(CATEGORIES).toEqual(
      sections.flatMap(({ section, categories }) =>
        categories.map((category) => ({ ...category, section })),
      ),
    )
  })
})
