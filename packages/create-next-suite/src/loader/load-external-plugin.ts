import { isDeepStrictEqual } from 'node:util'

import { summarizePlugin } from '../plugin-definition/plugin-metadata.ts'
import type { FetchedPlugin } from './fetch-external-plugin.ts'
import { type InstallRunner, installPluginDependencies } from './install-plugin-dependencies.ts'
import { type LoadedPluginModule, loadPluginModule } from './load-plugin-module.ts'
import { PluginLoadError } from './plugin-load-error.ts'

/**
 * An external plugin that has run: its module, and where it came from for the lock: its address,
 * what the address resolved to, the content hash of its files and whether it is a local directory.
 */
export type LoadedExternalPlugin = {
  module: LoadedPluginModule
} & Pick<FetchedPlugin, 'address' | 'resolved' | 'contentHash' | 'isLocal'>

/** How a trusted plugin runs: the entry it imports, the cache and how npm runs. */
type LoadContext = { pluginEntry: string; cacheDir: string; runCommand: InstallRunner }

/**
 * Runs the `plugin.ts` of a fetched plugin, which executes its code: only a plugin the user
 * trusts may come here. The npm packages its `package.json` names are installed first, without
 * install scripts; it imports them, its own files and `create-next-suite/plugin`, which goes to
 * `pluginEntry`. The metadata it exports has to be the metadata read from the file, so what the
 * questions and the trust prompt showed is what runs.
 *
 * @throws PluginLoadError when its dependencies do not install, the plugin does not load or its
 * metadata differs from what was read.
 */
export const loadExternalPlugin = async (
  fetched: FetchedPlugin,
  { pluginEntry, cacheDir, runCommand }: LoadContext,
): Promise<LoadedExternalPlugin> => {
  const directory = await installPluginDependencies(fetched, {
    cacheDir,
    runCommand,
    location: fetched.address,
  })
  const module = await loadPluginModule(directory, pluginEntry).catch((error: unknown) => {
    if (error instanceof PluginLoadError) {
      throw error
    }
    throw new PluginLoadError(fetched.address, 'its plugin.ts does not run', { cause: error })
  })
  if (!isDeepStrictEqual(summarizePlugin(module.plugin), fetched.summary)) {
    throw new PluginLoadError(
      fetched.address,
      'the metadata its plugin.ts exports differs from the fixed values written in it',
    )
  }
  const { address, resolved, contentHash, isLocal } = fetched
  return { module, address, resolved, contentHash, isLocal }
}
