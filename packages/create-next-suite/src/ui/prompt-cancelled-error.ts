import { ExpectedError } from '../expected-error.ts'

/** Thrown when the user cancels a prompt: Ctrl+C, Esc without a way back, or a Cancel choice. */
export class PromptCancelledError extends ExpectedError {
  override name = 'PromptCancelledError'

  constructor() {
    super('cancelled')
  }
}
