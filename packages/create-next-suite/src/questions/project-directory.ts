import { basename, isAbsolute, resolve } from 'node:path'

import validate from 'validate-npm-package-name'

import { isInsideOrSame } from '../file-system/is-inside.ts'

export const DEFAULT_PROJECT_DIRECTORY = 'my-app'

/** The package name of a project: the name of its directory, resolved from `cwd`. */
export const projectNameOf = (directory: string, cwd: string): string =>
  basename(resolve(cwd, directory))

const findNameProblem = (name: string): string | undefined => {
  const result = validate(name)
  if (result.validForNewPackages) {
    return undefined
  }
  return [...(result.errors ?? []), ...(result.warnings ?? [])].join('; ')
}

/**
 * Answers what is wrong with a project directory as typed, a name or a path such as `.`: it is
 * required, stays inside `cwd`, and its directory name is a valid name for a new npm package. What
 * is on disk at the path is checked by the writer. Answers nothing when the input is fine.
 */
export const findProjectDirectoryProblem = (directory: string, cwd: string): string | undefined => {
  if (directory.trim() === '') {
    return 'a name or path is required'
  }
  if (isAbsolute(directory) || !isInsideOrSame(cwd, resolve(cwd, directory))) {
    return "the target must be inside the current directory — no '..' or absolute paths"
  }
  const name = projectNameOf(directory, cwd)
  const nameProblem = findNameProblem(name)
  return nameProblem === undefined
    ? undefined
    : `"${name}" is not a valid package name: ${nameProblem}`
}
