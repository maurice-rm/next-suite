import { join } from 'node:path'

import { loadBaseProject } from '../loader/load-base-project.ts'
import { loadGroupedPluginModules } from '../loader/load-grouped-plugin-modules.ts'
import type { LoadedPluginModule } from '../loader/load-plugin-module.ts'

const BASE_DIRECTORY = 'base-project'
const PLUGINS_DIRECTORY = 'plugins-v2'

/** What ships with create-next-suite: the base project and the built-in plugins. */
export type BuiltInAssets = {
  /** The base project's files by project path. */
  baseFiles: ReadonlyMap<string, string>
  plugins: readonly LoadedPluginModule[]
}

/**
 * Loads the base project and the built-in plugins from the package root; their imports of
 * `create-next-suite/plugin` go to `pluginEntry`.
 */
export const loadBuiltInAssets = async (
  packageRoot: string,
  pluginEntry: string,
): Promise<BuiltInAssets> => ({
  baseFiles: await loadBaseProject(join(packageRoot, BASE_DIRECTORY)),
  plugins: await loadGroupedPluginModules(join(packageRoot, PLUGINS_DIRECTORY), pluginEntry),
})
