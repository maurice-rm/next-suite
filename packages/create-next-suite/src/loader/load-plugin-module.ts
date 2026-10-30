import { readFileSync } from 'node:fs'
import { lstat } from 'node:fs/promises'
import { join, resolve } from 'node:path'

import { createJiti } from 'jiti'

import { isMissingFileError } from '../file-system/error-code.ts'
import type { Plugin } from '../plugin-definition/plugin-definition.ts'
import { assertSourceFile } from './assert-source-file.ts'
import { PluginLoadError } from './plugin-load-error.ts'

const PLUGIN_FILE = 'plugin.ts'
/** The module plugins import `definePlugin` from. */
const PLUGIN_CONTRACT = 'create-next-suite/plugin'

/** A plugin written as `plugin.ts`, and how to read the files of its directory. */
export type LoadedPluginModule = {
  plugin: Plugin
  directory: string
  /**
   * The text of a file of the plugin's directory, such as `files/auth.ts`.
   *
   * @throws PluginLoadError for a file that is missing, no regular file or outside the directory.
   */
  readFile: (source: string) => string
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

/** Whether a default export looks like what `definePlugin` returns; its fields run as given. */
const isPlugin = (value: unknown): value is Plugin =>
  isRecord(value) && typeof value.name === 'string' && typeof value.title === 'string'

const assertPluginFile = async (directory: string, path: string): Promise<void> => {
  const stats = await lstat(path).catch((error: unknown) => {
    if (isMissingFileError(error)) {
      throw new PluginLoadError(directory, `no ${PLUGIN_FILE}`, { cause: error })
    }
    throw error
  })
  if (!stats.isFile()) {
    throw new PluginLoadError(directory, `${PLUGIN_FILE} is no regular file`)
  }
}

/**
 * Loads the plugin in a directory from its `plugin.ts`, run through jiti. Its imports of
 * `create-next-suite/plugin` go to `pluginEntry`, the entry of the running create-next-suite.
 *
 * @throws PluginLoadError when the directory has no `plugin.ts` or it exports no plugin.
 */
export const loadPluginModule = async (
  directory: string,
  pluginEntry: string,
): Promise<LoadedPluginModule> => {
  const root = resolve(directory)
  const path = join(root, PLUGIN_FILE)
  await assertPluginFile(root, path)
  const jiti = createJiti(import.meta.url, {
    fsCache: false,
    alias: { [PLUGIN_CONTRACT]: pluginEntry },
  })
  const plugin = await jiti.import(path, { default: true })
  if (!isPlugin(plugin)) {
    throw new PluginLoadError(
      root,
      `${PLUGIN_FILE} exports no plugin with a name and a title by default`,
    )
  }
  return {
    plugin,
    directory: root,
    readFile: (source) => {
      assertSourceFile(root, source)
      return readFileSync(resolve(root, source), 'utf8')
    },
  }
}
