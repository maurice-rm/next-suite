import { isAbsolute, relative, resolve, sep } from 'node:path'

import type { FetchedPlugin } from '../loader/fetch-external-plugin.ts'

const LOCAL_PREFIX = './'
const PARENT_PREFIX = '../'

/**
 * The entry a new project's config names an external plugin by: a local directory by its path
 * relative to the project, with `/` as separator, or by its absolute path on another drive; any
 * other plugin by its address.
 */
export const configEntryOf = (
  { address, isLocal }: Pick<FetchedPlugin, 'address' | 'isLocal'>,
  { cwd, projectDirectory }: { cwd: string; projectDirectory: string },
): string => {
  if (!isLocal) {
    return address
  }
  const directory = resolve(cwd, address)
  const path = relative(projectDirectory, directory)
  if (isAbsolute(path)) {
    return directory
  }
  const entry = path.split(sep).join('/')
  return entry.startsWith(PARENT_PREFIX) ? entry : `${LOCAL_PREFIX}${entry}`
}
