import packageJson from '../../package.json' with { type: 'json' }
import { ExpectedError } from '../expected-error.ts'

const describeUnexpected = (error: unknown): string =>
  error instanceof Error ? (error.stack ?? `${error.name}: ${error.message}`) : String(error)

/**
 * Answers what a failed run prints, named after the command that ran: the message of an expected
 * failure with its cause on the next line, or for anything else, which is a bug, a request to
 * report it with the stack.
 */
export const describeError = (error: unknown, command: string): string => {
  if (!(error instanceof ExpectedError)) {
    return `${command}: unexpected error, please report it at ${packageJson.bugs}\n${describeUnexpected(error)}`
  }
  const cause = error.cause instanceof Error ? `\n  ${error.cause.message}` : ''
  return `${command}: ${error.message}${cause}`
}
