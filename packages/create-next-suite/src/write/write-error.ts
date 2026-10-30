import { ExpectedError } from '../expected-error.ts'

/** A project directory that cannot be written. */
export class WriteError extends ExpectedError {
  override name = 'WriteError'
}
