import { basename, resolve } from 'node:path'

import validate from 'validate-npm-package-name'

export const DEFAULT_PROJECT_DIRECTORY = 'my-app'

/** The package name of a project: the name of its directory. */
export const projectNameOf = (directory: string): string => basename(resolve(directory))

/** Answers what is wrong with a project name for a new npm package, or nothing. */
export const findProjectNameProblem = (name: string): string | undefined => {
  const result = validate(name)
  if (result.validForNewPackages) {
    return undefined
  }
  return [...(result.errors ?? []), ...(result.warnings ?? [])].join('; ')
}
