import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { readTextIfPresent } from '../file-system/read-text-if-present.ts'
import { hashFileContent, parseLockFile, renderLockFile } from './lock-file.ts'
import { PROJECT_PATHS } from './project-paths.ts'

/**
 * Records in the lock each generated file as it is on disk now, once the project's own post-steps,
 * such as its formatter, changed what was written; a file that is gone keeps its hash.
 *
 * @throws ProjectConfigError for a lock that is no lock.
 */
export const rehashGeneratedFiles = async (projectDirectory: string): Promise<void> => {
  const path = join(projectDirectory, PROJECT_PATHS.lock)
  const lock = parseLockFile(await readFile(path, 'utf8'), path)
  const files: Record<string, string> = {}
  for (const [file, hash] of Object.entries(lock.files)) {
    const content = await readTextIfPresent(join(projectDirectory, file))
    files[file] = content === undefined ? hash : hashFileContent(content)
  }
  await writeFile(path, renderLockFile({ ...lock, files }))
}
