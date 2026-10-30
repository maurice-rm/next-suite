import { lstatSync, realpathSync } from 'node:fs'
import { isAbsolute, resolve } from 'node:path'

import { isMissingFileError } from '../file-system/error-code.ts'
import { isInside } from '../file-system/is-inside.ts'
import { PluginLoadError } from './plugin-load-error.ts'

const outsidePluginError = (directory: string, source: string): PluginLoadError =>
  new PluginLoadError(directory, `the file source ${source} lies outside the plugin`)

const assertRegularFile = (directory: string, source: string): void => {
  let stats: ReturnType<typeof lstatSync>
  try {
    stats = lstatSync(resolve(directory, source))
  } catch (error) {
    if (isMissingFileError(error)) {
      throw new PluginLoadError(directory, `the file source ${source} does not exist`, {
        cause: error,
      })
    }
    throw error
  }
  if (!stats.isFile()) {
    throw new PluginLoadError(directory, `the file source ${source} is not a regular file`)
  }
}

/**
 * Fails for a source that is no regular file inside the plugin: by its path first, then by its
 * real path, since lstat follows a symbolic link to a directory earlier in the path.
 *
 * @throws PluginLoadError naming the plugin directory and the source.
 */
export const assertSourceFile = (directory: string, source: string): void => {
  const path = resolve(directory, source)
  if (isAbsolute(source) || !isInside(directory, path)) {
    throw outsidePluginError(directory, source)
  }
  assertRegularFile(directory, source)
  if (!isInside(realpathSync(directory), realpathSync(path))) {
    throw outsidePluginError(directory, source)
  }
}
