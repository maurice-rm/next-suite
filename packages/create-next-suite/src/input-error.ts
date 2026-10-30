import { ExpectedError } from './expected-error.ts'

/** Answers that cannot be used: an unknown key, a wrong value, a missing answer, an incompatibility. */
export class InputError extends ExpectedError {
  override name = 'InputError'
}
