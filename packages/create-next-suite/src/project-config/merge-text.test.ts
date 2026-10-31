import { describe, expect, it } from 'vitest'

import { hasConflictMarkers, mergeText } from './merge-text.ts'

const BASE = ['one', 'two', 'three', 'four', 'five', ''].join('\n')

describe('mergeText', () => {
  it('merges changes to lines apart without a conflict', async () => {
    const merged = await mergeText({
      base: BASE,
      ours: BASE.replace('one', 'ONE'),
      theirs: BASE.replace('five', 'FIVE'),
    })

    expect(merged).toEqual({
      content: BASE.replace('one', 'ONE').replace('five', 'FIVE'),
      conflicts: 0,
    })
  })

  it('marks a line both sides changed with yours first and next-suite second', async () => {
    const merged = await mergeText({
      base: BASE,
      ours: BASE.replace('three', 'mine'),
      theirs: BASE.replace('three', 'theirs'),
    })

    expect(merged.conflicts).toBe(1)
    expect(merged.content).toBe(
      [
        'one',
        'two',
        '<<<<<<< yours',
        'mine',
        '=======',
        'theirs',
        '>>>>>>> next-suite',
        'four',
        'five',
        '',
      ].join('\n'),
    )
    expect(hasConflictMarkers(merged.content)).toBe(true)
  })

  it('takes text with a line of equal signs, as in Markdown, for text without markers', () => {
    expect(hasConflictMarkers('Title\n=======\n\ntext\n')).toBe(false)
  })
})
