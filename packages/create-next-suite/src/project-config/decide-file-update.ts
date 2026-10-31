const CRLF = '\r\n'
const LF = '\n'

/** One file before and after an update: the old and the new output, and the file you have. */
export type FileSides = {
  /** The file as the last generation wrote it, regenerated; nothing for a file it did not write. */
  base: string | undefined
  /** The file in the working tree; nothing when there is none. */
  ours: string | undefined
  /** The file as this generation writes it; nothing for a file it no longer writes. */
  theirs: string | undefined
  /** Whether the working tree's file still has the hash the lock recorded for it. */
  isUnchanged: boolean
}

/** What an update does with one file. */
export type FileDecision =
  | { kind: 'none' }
  | { kind: 'replace' }
  | { kind: 'merge' }
  | { kind: 'add' }
  | { kind: 'remove' }
  | { kind: 'keep'; reason: string }

const NONE: FileDecision = { kind: 'none' }

const normalize = (text: string | undefined): string | undefined => text?.replaceAll(CRLF, LF)

const decideGone = ({ base, ours, isUnchanged }: FileSides): FileDecision => {
  if (ours === undefined) {
    return NONE
  }
  if (isUnchanged || ours === base) {
    return { kind: 'remove' }
  }
  return {
    kind: 'keep',
    reason: 'next-suite no longer writes it, but you changed it',
  }
}

const decideMissing = ({ base, theirs }: FileSides): FileDecision => {
  if (base === undefined) {
    return { kind: 'add' }
  }
  if (theirs === base) {
    return NONE
  }
  return { kind: 'keep', reason: 'you deleted it; next-suite changed it' }
}

/**
 * What an update does with one file, by the old output (base), the working tree (ours) and the
 * new output (theirs), line endings compared as `\n`. A file you did not change takes the new
 * output; one you changed keeps your change, merged with next-suite's where both changed it. A
 * new file is added, a file you also wrote at its path merges against no base. A file next-suite
 * no longer writes goes only when you did not change it, and a file you deleted stays deleted.
 * The lock's hash decides whether you changed a file before the old output does, since the old
 * output, regenerated, may already hold a change of the generator.
 */
export const decideFileUpdate = (file: FileSides): FileDecision => {
  const sides = {
    ...file,
    base: normalize(file.base),
    ours: normalize(file.ours),
    theirs: normalize(file.theirs),
  }
  if (sides.theirs === sides.ours) {
    return NONE
  }
  if (sides.theirs === undefined) {
    return decideGone(sides)
  }
  if (sides.ours === undefined) {
    return decideMissing(sides)
  }
  if (sides.isUnchanged || (sides.base !== undefined && sides.ours === sides.base)) {
    return { kind: 'replace' }
  }
  if (sides.theirs === sides.base) {
    return NONE
  }
  return { kind: 'merge' }
}
