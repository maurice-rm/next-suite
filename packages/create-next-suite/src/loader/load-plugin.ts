import { lstat, readFile, realpath } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'

import semver from 'semver'
import * as z from 'zod'

import {
  CONTRACT_VERSION,
  type ParsedPluginManifest,
  pluginManifestSchema,
} from '../contract/plugin-manifest.ts'
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

const MISSING_FILE_CODES = new Set(['ENOENT', 'ENOTDIR'])

const isMissingFile = (error: unknown): boolean =>
  error instanceof Error && 'code' in error && MISSING_FILE_CODES.has(String(error.code))

const readManifestJson = async (folder: string): Promise<unknown> => {
  let text: string
  try {
    if ((await lstat(join(folder, MANIFEST_FILE))).isSymbolicLink()) {
      throw new PluginLoadError(folder, `${MANIFEST_FILE} is a link`)
    }
    text = await readFile(join(folder, MANIFEST_FILE), 'utf8')
  } catch (error) {
    if (isMissingFile(error)) {
      throw new PluginLoadError(folder, `no ${MANIFEST_FILE}`, { cause: error })
    }
    throw error
  }
  try {
    return JSON.parse(text)
  } catch (error) {
    throw new PluginLoadError(folder, `${MANIFEST_FILE} is not valid JSON`, { cause: error })
  }
}

const parseManifest = (folder: string, json: unknown): ParsedPluginManifest => {
  const result = pluginManifestSchema.safeParse(json)
  if (!result.success) {
    throw new PluginLoadError(folder, `invalid ${MANIFEST_FILE}\n${z.prettifyError(result.error)}`)
  }
  return result.data
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

const isInside = (folder: string, path: string): boolean => {
  const fromFolder = relative(folder, path)
  return (
    fromFolder !== '' &&
    fromFolder !== '..' &&
    !fromFolder.startsWith(`..${sep}`) &&
    !isAbsolute(fromFolder)
  )
}

const assertSourceFile = async (folder: string, source: string): Promise<void> => {
  const path = resolve(folder, source)
  if (isAbsolute(source) || !isInside(folder, path)) {
    throw new PluginLoadError(folder, `the file source ${source} lies outside the plugin`)
  }
  const stats = await lstat(path).catch((error: unknown) => {
    if (isMissingFile(error)) {
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
  const manifest = parseManifest(root, await readManifestJson(root))
  assertContract(root, manifest)
  for (const file of manifest.files ?? []) {
    await assertSourceFile(root, file.source)
  }
  if (manifest.logic !== undefined) {
    await assertSourceFile(root, manifest.logic)
  }
  return { manifest, folder: root, source }
}
