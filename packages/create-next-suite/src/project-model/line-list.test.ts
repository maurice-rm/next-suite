import { describe, expect, it } from 'vitest'

import { openLineList } from './line-list.ts'

describe('openLineList', () => {
  it('keeps the base text byte for byte and appends new lines once', () => {
    const lines = openLineList('# dependencies\n/node_modules\n\n# next.js\n/.next/\n')
    lines.add('/coverage')
    lines.add('/node_modules')
    lines.add('/coverage')

    expect(lines.print()).toBe('# dependencies\n/node_modules\n\n# next.js\n/.next/\n/coverage\n')
  })

  it('starts an empty list without a blank line', () => {
    const lines = openLineList('')
    lines.add('.env')

    expect(lines.print()).toBe('.env\n')
  })

  it('prints an unchanged list as it was', () => {
    expect(openLineList('a\nb').print()).toBe('a\nb')
  })
})
