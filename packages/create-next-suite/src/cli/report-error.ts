import { ExpectedError } from '../expected-error.ts'

/**
 * Answers the message of an expected failure, named after the command that ran, with its cause on
 * the next line, and rethrows anything else, which is a bug.
 */
export const describeExpectedError = (error: unknown, command: string): string => {
  if (!(error instanceof ExpectedError)) {
    throw error
  }
  const cause = error.cause instanceof Error ? `\n  ${error.cause.message}` : ''
  return `${command}: ${error.message}${cause}`
}
