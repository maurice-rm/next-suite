import { lstatSync, readdirSync } from 'node:fs'

/** What is at the path a project goes to; a folder with only harmless entries counts as empty. */
export type TargetState = 'missing' | 'empty' | 'not-empty' | 'not-a-folder'

/** Entries a fresh folder often has already, which never stand in the way of a new project. */
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

const NOT_A_FOLDER_CODES: ReadonlySet<string> = new Set(['ENOTDIR'])
const UNREADABLE_CODES: ReadonlySet<string> = new Set(['EACCES', 'EPERM'])

const codeOf = (error: unknown): string | undefined =>
  error instanceof Error && 'code' in error ? String(error.code) : undefined

/** Whether an entry at the top of a target folder may stay and be written over. */
export const isHarmlessEntry = (name: string): boolean =>
  HARMLESS_ENTRIES.has(name) || name.endsWith(HARMLESS_SUFFIX)

/**
 * Looks at the path a project goes to: missing, an empty folder (harmless entries such as `.git`
 * or `LICENSE` aside), a folder with other files, or something that is not a folder. A path that
 * runs through a file counts as not a folder.
 */
export const inspectTarget = (path: string): TargetState => {
  try {
    const stats = lstatSync(path, { throwIfNoEntry: false })
    if (stats === undefined) {
      return 'missing'
    }
    if (!stats.isDirectory()) {
      return 'not-a-folder'
    }
    return readdirSync(path).every(isHarmlessEntry) ? 'empty' : 'not-empty'
  } catch (error) {
    const code = codeOf(error)
    if (code !== undefined && NOT_A_FOLDER_CODES.has(code)) {
      return 'not-a-folder'
    }
    throw error
  }
}

/**
 * Answers why a project cannot go to a path at all, named `directory` in the message: a file is
 * there, or the folder cannot be read. A folder with files is no problem but a conflict the run
 * resolves; see `inspectTarget`.
 */
export const findTargetProblem = (directory: string, path: string): string | undefined => {
  try {
    return inspectTarget(path) === 'not-a-folder'
      ? 'A file already exists at that path — choose another name.'
      : undefined
  } catch (error) {
    const code = codeOf(error)
    if (code !== undefined && UNREADABLE_CODES.has(code)) {
      return `"${directory}" cannot be read`
    }
    throw error
  }
}
