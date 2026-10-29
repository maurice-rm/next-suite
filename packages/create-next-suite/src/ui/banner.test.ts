import ansis from 'ansis'
import { describe, expect, it } from 'vitest'

import { renderBanner } from './banner.ts'

const plain = (columns: number, latest?: string): string[] =>
  ansis
    .strip(
      renderBanner({ version: '2.0.0', latest, link: 'github.com/maurice-rm/next-suite', columns }),
    )
    .split('\n')

describe('renderBanner', () => {
  it('shows the wordmark, the tagline and version with link on a wide terminal', () => {
    const lines = plain(120)

    expect(lines[1]).toMatch(/^███╗/)
    expect(lines).toContainEqual(
      expect.stringMatching(/^\s+A better starting point for Next\.js\.$/),
    )
    expect(lines).toContainEqual(
      expect.stringMatching(/^\s+v2\.0\.0 {2}· {2}github\.com\/maurice-rm\/next-suite$/),
    )
  })

  it('shows the name in one line on a narrow terminal, centred', () => {
    const lines = plain(40)

    expect(lines[1]).toBe(`${' '.repeat(15)}next-suite`)
    expect(lines.every((line) => line.length <= 40)).toBe(true)
  })

  it('marks the version as latest or names the newer one', () => {
    expect(plain(120, '2.0.0')).toContainEqual(expect.stringContaining('v2.0.0 (latest)  ·'))
    expect(plain(120, '2.1.0')).toContainEqual(
      expect.stringContaining('v2.0.0 (update available → v2.1.0)  ·'),
    )
  })
})
