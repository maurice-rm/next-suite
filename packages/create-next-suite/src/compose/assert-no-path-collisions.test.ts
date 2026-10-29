import { describe, expect, it } from 'vitest'

import { assertNoPathCollisions } from './assert-no-path-collisions.ts'
import type { VirtualFiles } from './virtual-files.ts'

describe('assertNoPathCollisions', () => {
  const filesAt = (...entries: [string, string][]): VirtualFiles =>
    new Map(entries.map(([path, origin]) => [path, { path, content: '', origin }]))

  it('accepts paths that only share folders', () => {
    expect(() =>
      assertNoPathCollisions(filesAt(['lib/db.ts', 'a'], ['lib/env.ts', 'b'])),
    ).not.toThrow()
  })

  it('rejects two paths that differ only in case', () => {
    expect(() =>
      assertNoPathCollisions(filesAt(['README.md', 'base'], ['Readme.md', 'docs'])),
    ).toThrow(
      'base writes README.md and docs writes Readme.md, one file on case-insensitive systems',
    )
  })

  it('rejects a file where another file needs a folder', () => {
    expect(() => assertNoPathCollisions(filesAt(['lib', 'a'], ['lib/db.ts', 'b']))).toThrow(
      'a writes the file lib, which b needs as a folder for lib/db.ts',
    )
  })
})
