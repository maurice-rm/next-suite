import { lstat } from 'node:fs/promises'
import { join, resolve } from 'node:path'

import * as z from 'zod'

import { registryName } from '../contract/identifiers.ts'
import { isInside } from '../file-system/is-inside.ts'
import { readJsonFile } from '../file-system/read-json-file.ts'
import { fetchRemotePlugin, type RemoteEnvironment } from './fetch-remote-plugin.ts'
import { parsePluginAddress } from './plugin-address.ts'
import { PluginLoadError } from './plugin-load-error.ts'

/** The index file at the root of a registry. */
const REGISTRY_FILE = 'registry.json'

/** The index of a registry: its short name and the plugins it lists, each in a folder. */
export const registryIndexSchema = z
  .strictObject({
    // biome-ignore lint/style/useNamingConvention: JSON Schema fixes the name of this key
    $schema: z.string().optional(),
    name: registryName,
    plugins: z.array(
      z.strictObject({
        name: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
        path: z.string().min(1),
        description: z.string().min(1),
      }),
    ),
  })
  .meta({ title: 'next-suite plugin registry' })

/** The index of a registry, as listed in its registry.json. */
type RegistryIndex = z.output<typeof registryIndexSchema>

/** A fetched registry: its folder, what its source resolved to, and its index. */
export type FetchedRegistry = { folder: string; resolved: string | undefined; index: RegistryIndex }

type RegistrySources = { cwd: string; remote: RemoteEnvironment }

const readIndex = async (folder: string, source: string): Promise<RegistryIndex> => {
  const path = join(folder, REGISTRY_FILE)
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

/** Fetches a registry from a local folder or a remote source and reads its index. */
export const fetchRegistry = async (
  source: string,
  { cwd, remote }: RegistrySources,
): Promise<FetchedRegistry> => {
  const parsed = parsePluginAddress(source)
  if (parsed === undefined || parsed.kind === 'registry') {
    throw new PluginLoadError(source, 'a registry is a folder, a repository or a tarball')
  }
  const fetched =
    parsed.kind === 'local'
      ? { folder: resolve(cwd, parsed.path), resolved: undefined }
      : await fetchRemotePlugin(remote, parsed)
  return { ...fetched, index: await readIndex(fetched.folder, source) }
}

/** The folder of a plugin a registry lists; it fails for an unlisted name or a path outside. */
export const registryPluginFolder = (
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
  const folder = resolve(registry.folder, entry.path)
  if (!isInside(registry.folder, folder)) {
    throw new PluginLoadError(address, `the registry places ${name} outside itself`)
  }
  return folder
}
