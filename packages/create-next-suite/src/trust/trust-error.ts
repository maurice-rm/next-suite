import { ExpectedError } from '../expected-error.ts'

/** A plugin from a source the user does not trust, in a run that cannot ask about it. */
export class TrustError extends ExpectedError {
  override name = 'TrustError'
}
