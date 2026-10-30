import { ExpectedError } from '../expected-error.ts'

/** Plugins whose contributions cannot be combined into one project, or an unsafe target path. */
export class ComposeError extends ExpectedError {
  override name = 'ComposeError'
}
