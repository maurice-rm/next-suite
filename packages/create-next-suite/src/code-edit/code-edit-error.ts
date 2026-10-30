import { ExpectedError } from '../expected-error.ts'

/** A TypeScript file that does not parse, or a code edit whose target is not in the file. */
export class CodeEditError extends ExpectedError {
  override name = 'CodeEditError'
}
