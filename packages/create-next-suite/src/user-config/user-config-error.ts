import { ExpectedError } from '../expected-error.ts'

/** A user configuration that cannot be read, such as invalid JSON. */
export class UserConfigError extends ExpectedError {
  override name = 'UserConfigError'
}
