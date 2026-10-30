import { ExpectedError } from '../expected-error.ts'

/**
 * A project config, lock or project file next-suite cannot work with, such as a lock that is no
 * lock or a config that names an unknown plugin.
 */
export class ProjectConfigError extends ExpectedError {
  override name = 'ProjectConfigError'
}
