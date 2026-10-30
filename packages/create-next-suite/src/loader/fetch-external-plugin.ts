import { readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import type { PluginSummary } from '../plugin-definition/plugin-metadata.ts'
import { PluginMetadataError } from '../plugin-definition/plugin-metadata-error.ts'
import { readPluginMetadata } from '../plugin-definition/read-plugin-metadata.ts'
import { assertPluginFile, PLUGIN_FILE } from './load-plugin-module.ts'
import { parsePluginAddress } from './plugin-address.ts'
import { PluginLoadError } from './plugin-load-error.ts'
import { fetchRegistry, registryPluginDirectory } from './registry.ts'
import { fetchRemoteSource } from './remote/fetch-remote-source.ts'
import type { RemoteEnvironment } from './remote/remote-source.ts'
import { snapshotPlugin } from './snapshot-plugin.ts'

/** What fetching an external plugin needs: the working directory, the network and the registries. */
export type FetchContext = {
  cwd: string
  remote: RemoteEnvironment
  /** The source of each registry short name, such as `github:acme/plugins` for `@acme`. */
  registries: Readonly<Record<string, string>>
}

/**
 * An external plugin fetched and read, but not run: its address, what the address resolved to,
 * the snapshot of its files and the metadata read from its `plugin.ts`.
 */
export type FetchedPlugin = {
  address: string
  /** The commit, version or archive hash the address resolved to; none for a local directory. */
  resolved: string | undefined
  /** The snapshot of the plugin's files in the cache. */
  directory: string
  contentHash: string
  /** Whether the address is a local directory the user named, whose code is trusted. */
  isLocal: boolean
  summary: PluginSummary
}

type SourceDirectory = { directory: string; resolved: string | undefined; isLocal: boolean }

const locate = async (address: string, context: FetchContext): Promise<SourceDirectory> => {
  const parsed = parsePluginAddress(address)
  if (parsed === undefined) {
    throw new PluginLoadError(address, 'the address has no known form')
  }
  if (parsed.kind === 'local') {
    return { directory: resolve(context.cwd, parsed.path), resolved: undefined, isLocal: true }
  }
  if (parsed.kind === 'registry') {
    const source = context.registries[parsed.registry]
    if (source === undefined) {
      throw new PluginLoadError(
        address,
        `the registry ${parsed.registry} is unknown; add it with \`next-suite registry add\``,
      )
    }
    const registry = await fetchRegistry(source, context)
    return {
      directory: await registryPluginDirectory(registry, parsed.name, address),
      resolved: registry.resolved,
      isLocal: false,
    }
  }
  const fetched = await fetchRemoteSource(context.remote, parsed)
  return { ...fetched, isLocal: false }
}

const readSummary = async (directory: string, address: string): Promise<PluginSummary> => {
  const path = join(directory, PLUGIN_FILE)
  await assertPluginFile(address, path)
  try {
    return readPluginMetadata(path, await readFile(path, 'utf8'))
  } catch (error) {
    if (error instanceof PluginMetadataError) {
      throw new PluginLoadError(address, `${PLUGIN_FILE}: ${error.message}`, { cause: error })
    }
    throw error
  }
}

/**
 * Fetches the plugin at an address into the cache and reads its metadata without running any of
 * its code: a local directory directly, a registry short name through its registry, and npm,
 * GitHub, GitLab, Git or URL sources through the remote cache. The plugin's files are copied into
 * a snapshot, which every later step reads.
 *
 * @throws PluginLoadError for an address of no known form, an unknown registry, a source that
 * cannot be fetched, a directory without `plugin.ts`, a link in the plugin or metadata that is not
 * written as fixed values.
 */
export const fetchExternalPlugin = async (
  address: string,
  context: FetchContext,
): Promise<FetchedPlugin> => {
  const { directory, resolved, isLocal } = await locate(address, context)
  const snapshot = await snapshotPlugin(directory, {
    cacheDir: context.remote.cacheDir,
    location: address,
  })
  return {
    address,
    resolved,
    directory: snapshot.directory,
    contentHash: snapshot.contentHash,
    isLocal,
    summary: await readSummary(snapshot.directory, address),
  }
}
