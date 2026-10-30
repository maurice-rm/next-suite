import { join } from 'node:path'

import { listDirectories } from '../file-system/list-directories.ts'
import { assertUniqueNames } from './assert-unique-names.ts'
import { assertInGroup } from './load-assets.ts'
import { type LoadedPluginModule, loadPluginModule } from './load-plugin-module.ts'

/**
 * Loads the plugins written as `plugin.ts` from a directory with one directory per category and
 * `extras/` for the plugins without one, sorted by directory name. Imports of
 * `create-next-suite/plugin` go to `pluginEntry`.
 *
 * @throws PluginLoadError for a plugin that does not load, lies in the directory of another
 * category or shares its name with another.
 */
export const loadGroupedPluginModules = async (
  directory: string,
  pluginEntry: string,
): Promise<LoadedPluginModule[]> => {
  const plugins: LoadedPluginModule[] = []
  for (const group of await listDirectories(directory)) {
    for (const name of await listDirectories(join(directory, group))) {
      const loaded = await loadPluginModule(join(directory, group, name), pluginEntry)
      assertInGroup(
        { category: loaded.plugin.category, location: loaded.directory },
        { directory, group },
      )
      plugins.push(loaded)
    }
  }
  assertUniqueNames(
    plugins.map(({ plugin, directory }) => ({ name: plugin.name, location: directory })),
  )
  return plugins
}
