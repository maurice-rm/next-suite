import { join } from 'node:path'

import { loadBaseProject } from '../../loader/load-base-project.ts'
import { loadGroupedPluginModules } from '../../loader/load-grouped-plugin-modules.ts'
import type { LoadedPluginModule } from '../../loader/load-plugin-module.ts'

const BASE_PROJECT_DIRECTORY = 'base-project'
const PLUGINS_DIRECTORY = 'plugins-v2'

/** What ships with create-next-suite for the engine of plugins written as `plugin.ts`. */
export type EngineV2Assets = {
  /** The base project's files by project path. */
  baseFiles: ReadonlyMap<string, string>
  plugins: readonly LoadedPluginModule[]
}

/**
 * Loads the base project and the built-in plugins written as `plugin.ts` from the package root;
 * their imports of `create-next-suite/plugin` go to `pluginEntry`.
 */
export const loadEngineV2Assets = async (
  packageRoot: string,
  pluginEntry: string,
): Promise<EngineV2Assets> => ({
  baseFiles: await loadBaseProject(join(packageRoot, BASE_PROJECT_DIRECTORY)),
  plugins: await loadGroupedPluginModules(join(packageRoot, PLUGINS_DIRECTORY), pluginEntry),
})
