import { resolve } from 'node:path'

import { fetchRemotePlugin, type RemoteEnvironment } from './fetch-remote-plugin.ts'
import { type LoadedPlugin, loadPlugin } from './load-plugin.ts'
import { parsePluginAddress } from './plugin-address.ts'
import { PluginLoadError } from './plugin-load-error.ts'

type ExternalSources = {
  cwd: string
  remote: RemoteEnvironment
  /** The source of each registry short name, such as `github:acme/plugins` for `@acme`. */
  registries: Readonly<Record<string, string>>
}

const MAX_REGISTRY_DEPTH = 1

const loadOne = async (
  address: string,
  sources: ExternalSources,
  depth: number,
): Promise<LoadedPlugin> => {
  const parsed = parsePluginAddress(address)
  if (parsed === undefined) {
    throw new PluginLoadError(address, 'the address has no known form')
  }
  if (parsed.kind === 'local') {
    return loadPlugin(resolve(sources.cwd, parsed.path), {
      kind: 'external',
      address,
      resolved: undefined,
    })
  }
  if (parsed.kind === 'registry') {
    const registry = sources.registries[parsed.registry]
    if (registry === undefined || depth >= MAX_REGISTRY_DEPTH) {
      throw new PluginLoadError(
        address,
        `the registry ${parsed.registry} is unknown; add it to "registries" in the next-suite configuration`,
      )
    }
    const plugin = await loadOne(
      `${registry.replace(/#.*$/, '')}/${parsed.name}`,
      sources,
      depth + 1,
    )
    const resolved = plugin.source.kind === 'external' ? plugin.source.resolved : undefined
    return { ...plugin, source: { kind: 'external', address, resolved } }
  }
  const fetched = await fetchRemotePlugin(sources.remote, parsed)
  return loadPlugin(fetched.folder, { kind: 'external', address, resolved: fetched.resolved })
}

/**
 * Loads the plugins a user names by address: a local folder directly, a registry short name
 * through its registry, and npm, GitHub, GitLab, Git or URL sources through the cache.
 */
export const loadExternalPlugins = async (
  addresses: readonly string[],
  sources: ExternalSources,
): Promise<LoadedPlugin[]> => {
  const plugins: LoadedPlugin[] = []
  for (const address of addresses) {
    plugins.push(await loadOne(address, sources, 0))
  }
  return plugins
}
