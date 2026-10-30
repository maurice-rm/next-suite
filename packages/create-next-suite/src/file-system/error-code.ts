const MISSING_FILE_CODES: ReadonlySet<string> = new Set(['ENOENT', 'ENOTDIR'])

/** The `code` of a Node.js system error, such as `ENOENT`, or nothing for any other error. */
export const errorCodeOf = (error: unknown): string | undefined =>
  error instanceof Error && 'code' in error ? String(error.code) : undefined

/** Whether an error says nothing is at a path, also when the path runs through a file. */
export const isMissingFileError = (error: unknown): boolean =>
  MISSING_FILE_CODES.has(errorCodeOf(error) ?? '')
