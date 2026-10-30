import { ExpectedError } from '../expected-error.ts'

/**
 * A change the project cannot take: a second owner of a file, a value set twice differently, a
 * file a model needs that the project does not have.
 */
export class ProjectError extends ExpectedError {
  override name = 'ProjectError'
}
