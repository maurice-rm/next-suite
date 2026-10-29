import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

import type { Logic } from '../contract/logic.ts'
import type { LoadedPlugin } from './load-plugin.ts'
import { PluginLoadError } from './plugin-load-error.ts'

const isLogic = (value: unknown): value is Logic => typeof value === 'function'

/**
 * Imports the logic modules of plugins that have one, by plugin name. Importing runs the module's
 * code, so only plugins whose source is trusted may come here.
 */
export const loadLogic = async (
  plugins: readonly LoadedPlugin[],
): Promise<ReadonlyMap<string, Logic>> => {
  const logic = new Map<string, Logic>()
  for (const { manifest, folder } of plugins) {
    if (manifest.logic === undefined) {
      continue
    }
    const module: unknown = await import(pathToFileURL(join(folder, manifest.logic)).href).catch(
      (error: unknown) => {
        throw new PluginLoadError(folder, `its logic module ${manifest.logic} does not load`, {
          cause: error,
        })
      },
    )
    const run =
      typeof module === 'object' && module !== null ? Reflect.get(module, 'default') : undefined
    if (!isLogic(run)) {
      throw new PluginLoadError(folder, `its logic module ${manifest.logic} exports no function`)
    }
    logic.set(manifest.name, run)
  }
  return logic
}
