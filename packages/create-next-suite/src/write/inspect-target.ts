import { lstatSync, readdirSync } from 'node:fs'

/** What is at the path a project goes to. */
export type TargetState = 'missing' | 'empty' | 'not-empty' | 'not-a-folder'

const NOT_A_FOLDER_CODES: ReadonlySet<string> = new Set(['ENOTDIR'])
const UNREADABLE_CODES: ReadonlySet<string> = new Set(['EACCES', 'EPERM'])

const codeOf = (error: unknown): string | undefined =>
  error instanceof Error && 'code' in error ? String(error.code) : undefined

/**
 * Looks at the path a project goes to: missing, an empty or non-empty folder, or something that
 * is not a folder. A path that runs through a file counts as not a folder.
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
    return readdirSync(path).length > 0 ? 'not-empty' : 'empty'
  } catch (error) {
    const code = codeOf(error)
    if (code !== undefined && NOT_A_FOLDER_CODES.has(code)) {
      return 'not-a-folder'
    }
    throw error
  }
}

/** Whether a failure from inspecting a target means it cannot be read. */
const isUnreadable = (error: unknown): boolean => {
  const code = codeOf(error)
  return code !== undefined && UNREADABLE_CODES.has(code)
}

/**
 * Answers why a project cannot go to a path, named `directory` in the message: a file is there,
 * the folder is not empty or cannot be read. Answers nothing for a missing path or an empty folder.
 */
export const findTargetProblem = (directory: string, path: string): string | undefined => {
  let state: TargetState
  try {
    state = inspectTarget(path)
  } catch (error) {
    if (isUnreadable(error)) {
      return `"${directory}" cannot be read`
    }
    throw error
  }
  switch (state) {
    case 'not-a-folder':
      return 'A file already exists at that path — choose another name.'
    case 'not-empty':
      return `"${directory}" is not empty`
    default:
      return undefined
  }
}
