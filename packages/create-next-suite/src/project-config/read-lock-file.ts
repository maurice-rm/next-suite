import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { type LockFile, parseLockFile } from './lock-file.ts'
import { ProjectConfigError } from './project-config-error.ts'
import { PROJECT_PATHS } from './project-paths.ts'

/**
 * Reads the lock of the project at `root`.
 *
 * @throws ProjectConfigError for a lock that is missing, cannot be read or is no lock.
 */
export const readLockFile = async (root: string): Promise<LockFile> => {
  const path = join(root, PROJECT_PATHS.lock)
  const text = await readFile(path, 'utf8').catch((error: unknown) => {
    throw new ProjectConfigError(`cannot read ${path}`, { cause: error })
  })
  return parseLockFile(text, path)
}
