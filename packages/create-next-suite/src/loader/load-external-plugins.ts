import { resolve } from 'node:path'

import { type LoadedPlugin, loadPlugin } from './load-plugin.ts'
import { parsePluginAddress } from './plugin-address.ts'
import { PluginLoadError } from './plugin-load-error.ts'

/**
 * Loads the plugins a user names by address, such as `./plugins/mail`, resolved from `cwd`.
 * Local folders load directly; other sources fail until their loader exists.
 */
export const loadExternalPlugins = async (
  addresses: readonly string[],
  cwd: string,
): Promise<LoadedPlugin[]> => {
  const plugins: LoadedPlugin[] = []
  for (const address of addresses) {
    const parsed = parsePluginAddress(address)
    if (parsed === undefined) {
      throw new PluginLoadError(address, 'the address has no known form')
    }
    if (parsed.kind !== 'local') {
      throw new PluginLoadError(address, `${parsed.kind} sources are not supported yet`)
    }
    plugins.push(
      await loadPlugin(resolve(cwd, parsed.path), {
        kind: 'external',
        address,
        resolved: undefined,
      }),
    )
  }
  return plugins
}
