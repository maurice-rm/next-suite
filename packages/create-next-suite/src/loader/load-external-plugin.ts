import { isDeepStrictEqual } from 'node:util'

import { summarizePlugin } from '../plugin-definition/plugin-metadata.ts'
import type { FetchedPlugin } from './fetch-external-plugin.ts'
import { type LoadedPluginModule, loadPluginModule } from './load-plugin-module.ts'
import { PluginLoadError } from './plugin-load-error.ts'

/** An external plugin that has run: its module, and where it came from for next-suite.json. */
export type LoadedExternalPlugin = {
  module: LoadedPluginModule
  address: string
  resolved: string | undefined
}

/**
 * Runs the `plugin.ts` of a fetched plugin from its snapshot, which executes its code: only a
 * plugin the user trusts may come here. Its imports of `create-next-suite/plugin` go to
 * `pluginEntry`. The metadata it exports has to be the metadata read from the file, so what the
 * questions and the trust prompt showed is what runs.
 *
 * @throws PluginLoadError when the plugin does not load or its metadata differs from what was read.
 */
export const loadExternalPlugin = async (
  fetched: FetchedPlugin,
  pluginEntry: string,
): Promise<LoadedExternalPlugin> => {
  const module = await loadPluginModule(fetched.directory, pluginEntry).catch((error: unknown) => {
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
  return { module, address: fetched.address, resolved: fetched.resolved }
}
