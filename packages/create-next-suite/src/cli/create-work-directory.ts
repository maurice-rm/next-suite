import { mkdir, mkdtemp } from 'node:fs/promises'
import { dirname, join } from 'node:path'

const WORK_DIRECTORY = 'work'
/** Only the user may enter the directory the work directories lie in. */
const PRIVATE_MODE = 0o700

/**
 * A fresh, empty directory for one step of an update, beside the plugin cache. The shared
 * temporary directory is no place for it: anyone may write a `.npmrc`, `pnpm-workspace.yaml` or
 * `.yarnrc.yml` into its parent, and npm, pnpm and Yarn read those from every directory above.
 */
export const createWorkDirectory = async (cacheDir: string, step: string): Promise<string> => {
  const base = join(dirname(cacheDir), WORK_DIRECTORY)
  await mkdir(base, { recursive: true, mode: PRIVATE_MODE })
  return mkdtemp(join(base, `${step}-`))
}
