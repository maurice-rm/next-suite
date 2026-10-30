import { describe, expect, it } from 'vitest'

import { findPathCollision } from './find-path-collision.ts'

describe('findPathCollision', () => {
  const filesAt = (...entries: [string, string][]) =>
    entries.map(([path, origin]) => ({ path, origin }))

  it('accepts paths that only share directories', () => {
    expect(findPathCollision(filesAt(['lib/db.ts', 'a'], ['lib/env.ts', 'b']))).toBeUndefined()
  })

  it('describes two paths that differ only in case', () => {
    expect(findPathCollision(filesAt(['README.md', 'base'], ['Readme.md', 'docs']))).toBe(
      'base writes README.md and docs writes Readme.md, one file on case-insensitive systems',
    )
  })

  it('describes a file where another file needs a directory', () => {
    expect(findPathCollision(filesAt(['lib', 'a'], ['lib/db.ts', 'b']))).toBe(
      'a writes the file lib, which b needs as a directory for lib/db.ts',
    )
  })
})
