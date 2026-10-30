import { describe, expect, it } from 'vitest'

import { reindent } from './reindent.ts'

describe('reindent', () => {
  it('indents the lines after the first by their bracket depth', () => {
    expect(reindent('{\na: [\n1,\n],\n}', '  ', '  ')).toBe('{\n    a: [\n      1,\n    ],\n  }')
  })

  it('ignores brackets inside strings, escaped quotes and line comments', () => {
    expect(reindent("{\na: \"{[(\",\nb: '\\'{',\nc: 1, // {\n}", '', '\t')).toBe(
      "{\n\ta: \"{[(\",\n\tb: '\\'{',\n\tc: 1, // {\n}",
    )
  })

  it('leaves the lines inside a template literal as they are', () => {
    expect(reindent('[\n`a {\n    b`,\n]', '', '  ')).toBe('[\n  `a {\n    b`,\n]')
  })

  it('empties lines that hold only whitespace', () => {
    expect(reindent('{\n   \na: 1,\n}', '', '  ')).toBe('{\n\n  a: 1,\n}')
  })
})
