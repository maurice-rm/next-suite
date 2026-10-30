import { join } from 'node:path'

import { listFolders } from '../file-system/list-folders.ts'
import { type LoadedPlugin, loadPlugin } from './load-plugin.ts'
import { PluginLoadError } from './plugin-load-error.ts'

/** Fails when two plugins share a name. */
export const assertUniqueNames = (plugins: readonly LoadedPlugin[]): void => {
  const seen = new Set<string>()
  for (const plugin of plugins) {
    if (seen.has(plugin.manifest.name)) {
      throw new PluginLoadError(plugin.folder, `two plugins are named ${plugin.manifest.name}`)
    }
    seen.add(plugin.manifest.name)
  }
}

/** Loads every plugin folder directly inside a directory, sorted by folder name. */
export const loadPlugins = async (directory: string): Promise<LoadedPlugin[]> => {
  const folders = await listFolders(directory)
  const plugins = await Promise.all(folders.map((folder) => loadPlugin(join(directory, folder))))
  assertUniqueNames(plugins)
  return plugins
}
