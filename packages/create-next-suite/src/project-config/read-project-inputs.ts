import { readdir, readFile } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'

import { isMissingFileError } from '../file-system/error-code.ts'
import { ProjectConfigError } from './project-config-error.ts'
import { PROJECT_PATHS } from './project-paths.ts'

/** Directories the inputs leave out: installed packages and Git. */
const SKIPPED_DIRECTORIES: ReadonlySet<string> = new Set(['node_modules', '.git'])
/** The NUL byte, which Git and editors take as the mark of a binary file. */
const BINARY_MARK = 0

const listEntries = async (directory: string) => {
  try {
    return await readdir(directory, { recursive: true, withFileTypes: true })
  } catch (error) {
    if (isMissingFileError(error)) {
      return []
    }
    throw error
  }
}

const readText = async (path: string, projectPath: string): Promise<string> => {
  const content = await readFile(path)
  if (content.includes(BINARY_MARK)) {
    throw new ProjectConfigError(
      `${projectPath} is a binary file; ${PROJECT_PATHS.inputDirectory}/ holds text files only`,
    )
  }
  return content.toString('utf8')
}

/**
 * The project's own inputs: every file under `next-suite/`, its plugins and overrides, by its path
 * in the project with `/` as separator, sorted. `node_modules` and `.git` are left out.
 *
 * @throws ProjectConfigError for a link or other entry that is no regular file, and for a binary
 * file, which the generator would corrupt.
 */
export const readProjectInputs = async (projectDirectory: string): Promise<Map<string, string>> => {
  const root = join(projectDirectory, PROJECT_PATHS.inputDirectory)
  const inputs: [string, string][] = []
  for (const entry of await listEntries(root)) {
    const path = join(entry.parentPath, entry.name)
    const segments = relative(projectDirectory, path).split(sep)
    if (segments.some((segment) => SKIPPED_DIRECTORIES.has(segment)) || entry.isDirectory()) {
      continue
    }
    const projectPath = segments.join('/')
    if (!entry.isFile()) {
      throw new ProjectConfigError(`${projectPath} is a link or no regular file`)
    }
    inputs.push([projectPath, await readText(path, projectPath)])
  }
  return new Map(inputs.sort(([left], [right]) => (left < right ? -1 : 1)))
}
