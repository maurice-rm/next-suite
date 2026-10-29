import { ComposeError } from '../compose/compose-error.ts'
import { InputError } from '../input/input-error.ts'
import { PluginLoadError } from '../loader/plugin-load-error.ts'
import { TemplateError } from '../template/template-error.ts'
import { WriteError } from '../write/write-error.ts'

const EXPECTED_ERRORS = [InputError, ComposeError, WriteError, PluginLoadError, TemplateError]

/**
 * Answers the message of an expected failure, with its cause on the next line, and rethrows
 * anything else, which is a bug.
 */
export const describeExpectedError = (error: unknown): string => {
  if (!(error instanceof Error) || !EXPECTED_ERRORS.some((expected) => error instanceof expected)) {
    throw error
  }
  const cause = error.cause instanceof Error ? `\n  ${error.cause.message}` : ''
  return `${error.message}${cause}`
}
