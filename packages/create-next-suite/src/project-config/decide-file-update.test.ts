import { describe, expect, it } from 'vitest'

import { decideFileUpdate } from './decide-file-update.ts'

const OLD = 'old\n'
const NEW = 'new\n'
const MINE = 'mine\n'

describe('decideFileUpdate', () => {
  it('leaves a file alone when the new output is what the file holds', () => {
    expect(
      decideFileUpdate({
        base: OLD,
        ours: NEW,
        theirs: NEW,
        isUnchanged: false,
      }),
    ).toEqual({
      kind: 'none',
    })
  })

  it('replaces a file you did not change', () => {
    expect(
      decideFileUpdate({
        base: OLD,
        ours: OLD,
        theirs: NEW,
        isUnchanged: true,
      }),
    ).toEqual({
      kind: 'replace',
    })
  })

  it('replaces a file the lock says is unchanged even when the old output differs from it', () => {
    expect(
      decideFileUpdate({
        base: 'regenerated\n',
        ours: OLD,
        theirs: NEW,
        isUnchanged: true,
      }),
    ).toEqual({
      kind: 'replace',
    })
  })

  it('keeps your change when next-suite did not change the file', () => {
    expect(
      decideFileUpdate({
        base: OLD,
        ours: MINE,
        theirs: OLD,
        isUnchanged: false,
      }),
    ).toEqual({
      kind: 'none',
    })
  })

  it('merges a file both sides changed', () => {
    expect(
      decideFileUpdate({
        base: OLD,
        ours: MINE,
        theirs: NEW,
        isUnchanged: false,
      }),
    ).toEqual({
      kind: 'merge',
    })
  })

  it('adds a new file and merges against no base where you wrote one at its path', () => {
    expect(
      decideFileUpdate({
        base: undefined,
        ours: undefined,
        theirs: NEW,
        isUnchanged: false,
      }),
    ).toEqual({ kind: 'add' })
    expect(
      decideFileUpdate({
        base: undefined,
        ours: MINE,
        theirs: NEW,
        isUnchanged: false,
      }),
    ).toEqual({
      kind: 'merge',
    })
  })

  it('removes a file next-suite no longer writes only when you did not change it', () => {
    expect(
      decideFileUpdate({
        base: OLD,
        ours: OLD,
        theirs: undefined,
        isUnchanged: true,
      }),
    ).toEqual({ kind: 'remove' })
    expect(
      decideFileUpdate({
        base: OLD,
        ours: MINE,
        theirs: undefined,
        isUnchanged: false,
      }),
    ).toEqual({
      kind: 'keep',
      reason: 'next-suite no longer writes it, but you changed it',
    })
  })

  it('leaves a file you deleted deleted, and says so when next-suite changed it', () => {
    expect(
      decideFileUpdate({
        base: OLD,
        ours: undefined,
        theirs: OLD,
        isUnchanged: false,
      }),
    ).toEqual({ kind: 'none' })
    expect(
      decideFileUpdate({
        base: OLD,
        ours: undefined,
        theirs: NEW,
        isUnchanged: false,
      }),
    ).toEqual({
      kind: 'keep',
      reason: 'you deleted it; next-suite changed it',
    })
  })

  it('compares line endings as \\n, so a checkout with CRLF counts as unchanged', () => {
    expect(
      decideFileUpdate({
        base: OLD,
        ours: 'new\r\n',
        theirs: NEW,
        isUnchanged: false,
      }),
    ).toEqual({ kind: 'none' })
  })
})
