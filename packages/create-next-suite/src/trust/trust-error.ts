import { ExpectedError } from '../expected-error.ts'

/** A plugin source that is not trusted, or a user configuration that cannot be read. */
export class TrustError extends ExpectedError {
  override name = 'TrustError'
}
