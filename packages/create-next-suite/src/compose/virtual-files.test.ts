import { describe, expect, it } from 'vitest'

import { addFile, type ConflictStrategy, type VirtualFiles } from './virtual-files.ts'

type ContributionInput = {
  origin: string
  content: string
  conflict?: ConflictStrategy
  replaceable?: string[]
}

const contribution = ({
  origin,
  content,
  conflict = 'error',
  replaceable = [],
}: ContributionInput) => ({
  path: 'lib/db.ts',
  content,
  origin,
  conflict,
  replaceable: new Set(replaceable),
})

const filesWith = (...inputs: ContributionInput[]): VirtualFiles => {
  const files: VirtualFiles = new Map()
  for (const input of inputs) {
    addFile(files, contribution(input))
  }
  return files
}

describe('addFile', () => {
  it('rejects a second file at the same path with other content', () => {
    expect(() =>
      filesWith({ origin: 'drizzle', content: 'a' }, { origin: 'prisma', content: 'b' }),
    ).toThrow('drizzle and prisma both write lib/db.ts')
  })

  it('accepts a second file with identical content', () => {
    const files = filesWith({ origin: 'one', content: 'same' }, { origin: 'two', content: 'same' })

    expect(files.get('lib/db.ts')?.origin).toBe('one')
  })

  it('keeps the first file for skip-if-exists', () => {
    const files = filesWith(
      { origin: 'one', content: 'first' },
      { origin: 'two', content: 'second', conflict: 'skip-if-exists' },
    )

    expect(files.get('lib/db.ts')?.content).toBe('first')
  })

  it('replaces a file of a required plugin', () => {
    const files = filesWith(
      { origin: 'drizzle', content: 'a' },
      { origin: 'extra', content: 'b', conflict: 'replace', replaceable: ['drizzle'] },
    )

    expect(files.get('lib/db.ts')).toEqual({ path: 'lib/db.ts', content: 'b', origin: 'extra' })
  })

  it('rejects replacing a file of a plugin that is not required', () => {
    expect(() =>
      filesWith(
        { origin: 'drizzle', content: 'a' },
        { origin: 'extra', content: 'b', conflict: 'replace' },
      ),
    ).toThrow('extra replaces lib/db.ts from drizzle, but does not require drizzle')
  })
})
