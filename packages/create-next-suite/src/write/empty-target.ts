import { realpathSync } from 'node:fs'
import { readdir, rm } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join, parse, resolve } from 'node:path'

import { errorCodeOf } from '../file-system/error-code.ts'
import { isInsideOrSame } from '../file-system/is-inside.ts'
import { WriteError } from './write-error.ts'

const KEPT_ENTRY = '.git'
const NOTHING_THERE = 'ENOENT'

/** The real path with links resolved, or the plain absolute path when nothing is there yet. */
const realPathOf = (path: string): string => {
  try {
    return realpathSync(path)
  } catch (error) {
    if (errorCodeOf(error) === NOTHING_THERE) {
      return resolve(path)
    }
    throw error
  }
}

/** Answers why a folder must never be emptied: a root, the home folder, or the folder of the run. */
export const findEmptyingProblem = (directory: string, cwd: string): string | undefined => {
  const path = realPathOf(directory)
  const isRefused =
    path === parse(path).root ||
    path === realPathOf(homedir()) ||
    isInsideOrSame(path, realPathOf(cwd))
  return isRefused
    ? `refusing to empty ${path}: it is a filesystem root, your home directory, or the current directory or one of its parents`
    : undefined
}

/** Deletes everything in a folder except `.git`, after checking it may be emptied at all. */
export const emptyTarget = async (directory: string, cwd: string): Promise<void> => {
  const problem = findEmptyingProblem(directory, cwd)
  if (problem !== undefined) {
    throw new WriteError(problem)
  }
  for (const entry of await readdir(directory)) {
    if (entry !== KEPT_ENTRY) {
      await rm(join(directory, entry), { recursive: true, force: true })
    }
  }
}
