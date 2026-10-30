import { readFile } from 'node:fs/promises'

import { isMissingFileError } from './error-code.ts'

/** The text of a file, or nothing when there is no file at the path. */
export const readTextIfPresent = async (path: string): Promise<string | undefined> => {
  try {
    return await readFile(path, 'utf8')
  } catch (error) {
    if (isMissingFileError(error)) {
      return undefined
    }
    throw error
  }
}
