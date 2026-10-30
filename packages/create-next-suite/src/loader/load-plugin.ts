import { lstat, realpath } from 'node:fs/promises'
import { isAbsolute, join, resolve } from 'node:path'

import semver from 'semver'

import {
  CONTRACT_VERSION,
  type ParsedPluginManifest,
  pluginManifestSchema,
} from '../contract/plugin-manifest.ts'
import { isMissingFileError } from '../file-system/error-code.ts'
import { isInside } from '../file-system/is-inside.ts'
import { type JsonErrorFactory, readJsonFile } from '../file-system/read-json-file.ts'
import { PluginLoadError } from './plugin-load-error.ts'

const MANIFEST_FILE = 'plugin.json'

/** Where a loaded plugin came from: shipped with create-next-suite, or the address a user gave. */
export type PluginSource =
  | { kind: 'builtin' }
  | { kind: 'external'; address: string; resolved: string | undefined }

const BUILTIN_SOURCE: PluginSource = { kind: 'builtin' }

export type LoadedPlugin = {
  manifest: ParsedPluginManifest
  folder: string
  source: PluginSource
}

const readManifest = async (folder: string): Promise<ParsedPluginManifest> => {
  const path = join(folder, MANIFEST_FILE)
  const toError: JsonErrorFactory = (problem, options) =>
    new PluginLoadError(folder, `${MANIFEST_FILE} ${problem}`, options)
  try {
    if ((await lstat(path)).isSymbolicLink()) {
      throw new PluginLoadError(folder, `${MANIFEST_FILE} is a link`)
    }
    return await readJsonFile(path, pluginManifestSchema, toError)
  } catch (error) {
    if (isMissingFileError(error)) {
      throw new PluginLoadError(folder, `no ${MANIFEST_FILE}`, { cause: error })
    }
    throw error
  }
}

const assertContract = (folder: string, manifest: ParsedPluginManifest): void => {
  if (semver.satisfies(CONTRACT_VERSION, manifest.contract)) {
    return
  }
  throw new PluginLoadError(
    folder,
    `it needs plugin contract ${manifest.contract}, this create-next-suite implements ${CONTRACT_VERSION}`,
  )
}

const assertSourceFile = async (folder: string, source: string): Promise<void> => {
  const path = resolve(folder, source)
  if (isAbsolute(source) || !isInside(folder, path)) {
    throw new PluginLoadError(folder, `the file source ${source} lies outside the plugin`)
  }
  const stats = await lstat(path).catch((error: unknown) => {
    if (isMissingFileError(error)) {
      throw new PluginLoadError(folder, `the file source ${source} does not exist`, {
        cause: error,
      })
    }
    throw error
  })
  if (!stats.isFile()) {
    throw new PluginLoadError(folder, `the file source ${source} is not a regular file`)
  }
  // A symbolic link to a folder earlier in the path is followed by lstat; compare real paths.
  if (!isInside(await realpath(folder), await realpath(path))) {
    throw new PluginLoadError(folder, `the file source ${source} lies outside the plugin`)
  }
}

/** Reads and checks the plugin in a folder; the same path serves built-in and local plugins. */
export const loadPlugin = async (
  folder: string,
  source: PluginSource = BUILTIN_SOURCE,
): Promise<LoadedPlugin> => {
  const root = resolve(folder)
  const manifest = await readManifest(root)
  assertContract(root, manifest)
  for (const file of manifest.files ?? []) {
    await assertSourceFile(root, file.source)
  }
  if (manifest.logic !== undefined) {
    await assertSourceFile(root, manifest.logic)
  }
  return { manifest, folder: root, source }
}
