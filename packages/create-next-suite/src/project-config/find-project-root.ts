import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { ProjectConfigError } from './project-config-error.ts'
import { PROJECT_PATHS } from './project-paths.ts'

const isProjectRoot = (directory: string): boolean =>
  existsSync(join(directory, PROJECT_PATHS.config)) ||
  existsSync(join(directory, PROJECT_PATHS.generatorDirectory))

/**
 * The root of the next-suite project a directory lies in: the nearest directory, itself or above,
 * with a `next-suite.config.ts` or a `.next-suite/` directory.
 *
 * @throws ProjectConfigError when no directory up to the file system's root is one.
 */
export const findProjectRoot = (start: string): string => {
  for (let directory = start; ; directory = dirname(directory)) {
    if (isProjectRoot(directory)) {
      return directory
    }
    if (dirname(directory) === directory) {
      throw new ProjectConfigError(
        `${start} lies in no next-suite project: no directory up to the root has a ${PROJECT_PATHS.config} or ${PROJECT_PATHS.generatorDirectory}/`,
      )
    }
  }
}
