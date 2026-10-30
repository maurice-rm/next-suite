import { lstatSync, readdirSync } from 'node:fs'

import { errorCodeOf } from '../file-system/error-code.ts'

/**
 * What is at the path a project goes to; a directory with only harmless entries counts as empty.
 */
export type TargetState = 'missing' | 'empty' | 'not-empty' | 'not-a-directory'

/** Entries a fresh directory often has already, which never stand in the way of a new project. */
const HARMLESS_ENTRIES: ReadonlySet<string> = new Set([
  '.git',
  '.gitignore',
  '.gitattributes',
  '.gitkeep',
  '.idea',
  '.vscode',
  '.DS_Store',
  'Thumbs.db',
  '.npmignore',
  'LICENSE',
  'LICENSE.md',
])
const HARMLESS_SUFFIX = '.iml'

const NOT_A_DIRECTORY_CODES: ReadonlySet<string> = new Set(['ENOTDIR'])
const UNREADABLE_CODES: ReadonlySet<string> = new Set(['EACCES', 'EPERM'])

/** Whether an entry at the top of a target directory may stay and be written over. */
export const isHarmlessEntry = (name: string): boolean =>
  HARMLESS_ENTRIES.has(name) || name.endsWith(HARMLESS_SUFFIX)

/**
 * Looks at the path a project goes to: missing, an empty directory (harmless entries such as `.git`
 * or `LICENSE` aside), a directory with other files, or something that is not a directory. A path
 * that runs through a file counts as not a directory.
 */
export const inspectTarget = (path: string): TargetState => {
  try {
    const stats = lstatSync(path, { throwIfNoEntry: false })
    if (stats === undefined) {
      return 'missing'
    }
    if (!stats.isDirectory()) {
      return 'not-a-directory'
    }
    return readdirSync(path).every(isHarmlessEntry) ? 'empty' : 'not-empty'
  } catch (error) {
    const code = errorCodeOf(error)
    if (code !== undefined && NOT_A_DIRECTORY_CODES.has(code)) {
      return 'not-a-directory'
    }
    throw error
  }
}

/**
 * Answers why a project cannot go to a path at all, named `directory` in the message: a file is
 * there, or the directory cannot be read. A directory with files is no problem but a conflict the
 * run resolves; see `inspectTarget`.
 */
export const findTargetProblem = (directory: string, path: string): string | undefined => {
  try {
    return inspectTarget(path) === 'not-a-directory'
      ? 'a file already exists at that path; choose another name'
      : undefined
  } catch (error) {
    const code = errorCodeOf(error)
    if (code !== undefined && UNREADABLE_CODES.has(code)) {
      return `"${directory}" cannot be read`
    }
    throw error
  }
}
