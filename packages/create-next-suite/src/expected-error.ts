/**
 * A failure the user can act on, such as invalid answers or a plugin that cannot be loaded. The
 * command prints its message with the command's name; any other error is a bug.
 */
export class ExpectedError extends Error {
  override name = 'ExpectedError'
}
