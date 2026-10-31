import { ExpectedError } from '../expected-error.ts'

/** An update that left merge conflicts; the run fails once its report is out. */
export class UpdateMergeConflictError extends ExpectedError {
  override name = 'UpdateMergeConflictError'
}
