import { ExpectedError } from '../expected-error.ts'

/**
 * A contribution to a shared point that contradicts an earlier one, such as two plugins adding
 * different tables under one name; the run names the plugin and its step in front.
 */
export class PointError extends ExpectedError {
  override name = 'PointError'
}
