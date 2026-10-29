import { realpathSync } from 'node:fs'
import { readdir, rm } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join, parse, relative, resolve, sep } from 'node:path'

import { WriteError } from './write-error.ts'

const KEPT_ENTRY = '.git'

const contains = (folder: string, path: string): boolean => {
  const fromFolder = relative(folder, path)
  return fromFolder === '' || (!fromFolder.startsWith(`..${sep}`) && fromFolder !== '..')
}

/** The real path with links resolved, or the plain absolute path when nothing is there yet. */
const realPathOf = (path: string): string => {
  try {
    return realpathSync(path)
  } catch {
    return resolve(path)
  }
}

/** Answers why a folder must never be emptied: a root, the home folder, or the folder of the run. */
export const findEmptyingProblem = (directory: string, cwd: string): string | undefined => {
  const path = realPathOf(directory)
  const isRefused =
    path === parse(path).root || path === realPathOf(homedir()) || contains(path, realPathOf(cwd))
  return isRefused
    ? `Refusing to empty ${path}: it is a filesystem root, your home directory, or the current directory or one of its parents.`
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
