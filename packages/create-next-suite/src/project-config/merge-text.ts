import { execFile } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

/** How the sides of a conflict are labelled: your file, the last generated one, next-suite's. */
const LABELS = {
  ours: 'yours',
  base: 'last generated',
  theirs: 'next-suite',
} as const
/** The marker lines git writes around a conflict with these labels. */
const MARKERS = [`<<<<<<< ${LABELS.ours}`, `||||||| ${LABELS.base}`, `>>>>>>> ${LABELS.theirs}`]
/** git merge-file exits with the number of conflicts up to this; above it, git failed. */
const MAX_CONFLICT_STATUS = 127
/** The largest file a merge reads back, far above any generated file. */
const MAX_OUTPUT_BYTES = 64 * 1024 * 1024

const execFileAsync = promisify(execFile)

/** A file merged line by line and the number of conflicts git marked in it. */
export type TextMerge = { content: string; conflicts: number }

const isExitWithOutput = (error: unknown): error is { code: number; stdout: string } =>
  typeof error === 'object' &&
  error !== null &&
  'code' in error &&
  typeof error.code === 'number' &&
  'stdout' in error &&
  typeof error.stdout === 'string'

/**
 * A three-way merge by `git merge-file`, line by line: a conflict is marked with
 * `<<<<<<< yours` and `>>>>>>> next-suite`. git exits with the number of conflicts, so a positive
 * exit status is a result, not a failure; the three sides go through files in a fresh temporary
 * directory.
 */
export const mergeText = async (sides: {
  base: string
  ours: string
  theirs: string
}): Promise<TextMerge> => {
  const directory = await mkdtemp(join(tmpdir(), 'next-suite-merge-'))
  try {
    const files = {
      ours: join(directory, 'ours'),
      base: join(directory, 'base'),
      theirs: join(directory, 'theirs'),
    }
    await Promise.all([
      writeFile(files.ours, sides.ours),
      writeFile(files.base, sides.base),
      writeFile(files.theirs, sides.theirs),
    ])
    const args = [
      'merge-file',
      '--stdout',
      '-L',
      LABELS.ours,
      '-L',
      LABELS.base,
      '-L',
      LABELS.theirs,
      files.ours,
      files.base,
      files.theirs,
    ]
    try {
      const { stdout } = await execFileAsync('git', args, {
        cwd: directory,
        maxBuffer: MAX_OUTPUT_BYTES,
      })
      return { content: stdout, conflicts: 0 }
    } catch (error) {
      if (isExitWithOutput(error) && error.code > 0 && error.code <= MAX_CONFLICT_STATUS) {
        return { content: error.stdout, conflicts: error.code }
      }
      throw error
    }
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

/** Whether a text still holds a merge conflict marker of a merge by `mergeText`. */
export const hasConflictMarkers = (text: string): boolean =>
  text.split('\n').some((line) => MARKERS.some((marker) => line.trimEnd() === marker))
