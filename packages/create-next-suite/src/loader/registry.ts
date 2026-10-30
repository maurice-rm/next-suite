import { lstat } from 'node:fs/promises'
import { join, resolve } from 'node:path'

import { type RegistryIndex, registryIndexSchema } from '../contract/registry-index.ts'
import { isInside } from '../file-system/is-inside.ts'
import { readJsonFile } from '../file-system/read-json-file.ts'
import { parsePluginAddress } from './plugin-address.ts'
import { PluginLoadError } from './plugin-load-error.ts'
import { fetchRemoteSource } from './remote/fetch-remote-source.ts'
import type { RemoteEnvironment } from './remote/remote-source.ts'

const REGISTRY_FILE = 'registry.json'

export type FetchedRegistry = {
  directory: string
  resolved: string | undefined
  index: RegistryIndex
}

type RegistrySources = { cwd: string; remote: RemoteEnvironment }

const readIndex = async (directory: string, source: string): Promise<RegistryIndex> => {
  const path = join(directory, REGISTRY_FILE)
  const stats = await lstat(path).catch(() => undefined)
  if (stats === undefined || !stats.isFile()) {
    throw new PluginLoadError(source, `the registry has no ${REGISTRY_FILE}`)
  }
  return readJsonFile(
    path,
    registryIndexSchema,
    (problem, options) => new PluginLoadError(source, `${REGISTRY_FILE} ${problem}`, options),
  )
}

/** Fetches a registry from a local directory or a remote source and reads its index. */
export const fetchRegistry = async (
  source: string,
  { cwd, remote }: RegistrySources,
): Promise<FetchedRegistry> => {
  const parsed = parsePluginAddress(source)
  if (parsed === undefined || parsed.kind === 'registry') {
    throw new PluginLoadError(source, 'a registry is a directory, a repository or a tarball')
  }
  const fetched =
    parsed.kind === 'local'
      ? { directory: resolve(cwd, parsed.path), resolved: undefined }
      : await fetchRemoteSource(remote, parsed)
  return { ...fetched, index: await readIndex(fetched.directory, source) }
}

/** The directory of a plugin a registry lists; it fails for an unlisted name or a path outside. */
export const registryPluginDirectory = (
  registry: FetchedRegistry,
  name: string,
  address: string,
): string => {
  const entry = registry.index.plugins.find((plugin) => plugin.name === name)
  if (entry === undefined) {
    throw new PluginLoadError(
      address,
      `the registry ${registry.index.name} lists no plugin ${name}`,
    )
  }
  const directory = resolve(registry.directory, entry.path)
  if (!isInside(registry.directory, directory)) {
    throw new PluginLoadError(address, `the registry places ${name} outside itself`)
  }
  return directory
}
