import { lstat } from 'node:fs/promises'
import { join, resolve } from 'node:path'

import semver from 'semver'

import {
  CONTRACT_VERSION,
  type ParsedPluginManifest,
  pluginManifestSchema,
} from '../contract/plugin-manifest.ts'
import { isMissingFileError } from '../file-system/error-code.ts'
import { readJsonFile } from '../file-system/read-json-file.ts'
import { assertSourceFile } from './assert-source-file.ts'
import { PluginLoadError } from './plugin-load-error.ts'

const MANIFEST_FILE = 'plugin.json'

/** Where a loaded plugin came from: shipped with create-next-suite, or the address a user gave. */
export type PluginSource =
  | { kind: 'builtin' }
  | { kind: 'external'; address: string; resolved: string | undefined }

export type LoadedPlugin = {
  manifest: ParsedPluginManifest
  directory: string
  source: PluginSource
}

const BUILTIN_SOURCE: PluginSource = { kind: 'builtin' }

const assertManifestFile = async (directory: string, path: string): Promise<void> => {
  const stats = await lstat(path).catch((error: unknown) => {
    if (isMissingFileError(error)) {
      throw new PluginLoadError(directory, `no ${MANIFEST_FILE}`, {
        cause: error,
      })
    }
    throw error
  })
  if (stats.isSymbolicLink()) {
    throw new PluginLoadError(directory, `${MANIFEST_FILE} is a link`)
  }
}

const readManifest = async (directory: string): Promise<ParsedPluginManifest> => {
  const path = join(directory, MANIFEST_FILE)
  await assertManifestFile(directory, path)
  return readJsonFile(
    path,
    pluginManifestSchema,
    (problem, options) => new PluginLoadError(directory, `${MANIFEST_FILE} ${problem}`, options),
  )
}

const assertContract = (directory: string, manifest: ParsedPluginManifest): void => {
  if (semver.satisfies(CONTRACT_VERSION, manifest.contract)) {
    return
  }
  throw new PluginLoadError(
    directory,
    `it needs plugin contract ${manifest.contract}, this create-next-suite implements ${CONTRACT_VERSION}`,
  )
}

/** Reads and checks the plugin in a directory; the same path serves built-in and local plugins. */
export const loadPlugin = async (
  directory: string,
  source: PluginSource = BUILTIN_SOURCE,
): Promise<LoadedPlugin> => {
  const root = resolve(directory)
  const manifest = await readManifest(root)
  assertContract(root, manifest)
  for (const file of manifest.files ?? []) {
    assertSourceFile(root, file.source)
  }
  if (manifest.logic !== undefined) {
    assertSourceFile(root, manifest.logic)
  }
  return { manifest, directory: root, source }
}

/** A loaded plugin by its name and directory, to check that names are unique. */
export const namedPlugin = ({ manifest, directory }: LoadedPlugin) => ({
  name: manifest.name,
  location: directory,
})
