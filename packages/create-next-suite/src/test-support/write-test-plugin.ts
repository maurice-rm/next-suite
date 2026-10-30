import { basename } from 'node:path'

import type { PluginManifest } from '../contract/plugin-manifest.ts'
import { type LoadedPlugin, loadPlugin } from '../loader/load-plugin.ts'
import { testManifestJson } from './test-manifest.ts'
import { writeFiles } from './write-files.ts'

type TestPlugin = {
  manifest?: Partial<PluginManifest>
  files?: Readonly<Record<string, string>>
}

/** Writes a plugin named after its directory, with its manifest and files, and loads it. */
export const writeTestPlugin = async (
  directory: string,
  { manifest = {}, files = {} }: TestPlugin = {},
): Promise<LoadedPlugin> => {
  await writeFiles(directory, {
    'plugin.json': testManifestJson(basename(directory), manifest),
    ...files,
  })
  return loadPlugin(directory)
}
