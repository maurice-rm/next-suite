import { stat } from 'node:fs/promises'
import { join } from 'node:path'

import type * as z from 'zod'

import { type Category, categoriesSchema } from '../contract/category.ts'
import { type VersionCatalog, versionCatalogSchema } from '../contract/version-catalog.ts'
import { ExpectedError } from '../expected-error.ts'
import { isMissingFileError } from '../file-system/error-code.ts'
import { listDirectories } from '../file-system/list-directories.ts'
import { readJsonFile } from '../file-system/read-json-file.ts'
import { assertUniqueNames } from './assert-unique-names.ts'
import { type LoadedPlugin, loadPlugin } from './load-plugin.ts'
import { PluginLoadError } from './plugin-load-error.ts'

/**
 * What ships with create-next-suite: the base project, the built-in plugins, their categories
 * and versions. Without a base project a run asks its questions but generates nothing.
 */
export type Assets = {
  base: LoadedPlugin | undefined
  plugins: LoadedPlugin[]
  categories: Category[]
  catalog: VersionCatalog
}

const BASE_DIRECTORY = 'base'
const PLUGINS_DIRECTORY = 'plugins'
const CATEGORIES_FILE = 'categories.json'
const CATALOG_FILE = 'catalog.json'
/** The directory of the plugins without a category; every other directory is named after a category. */
const EXTRAS_DIRECTORY = 'extras'

const exists = async (path: string): Promise<boolean> =>
  stat(path).then(
    () => true,
    (error: unknown) => {
      if (isMissingFileError(error)) {
        return false
      }
      throw error
    },
  )

const readJson = async <Schema extends z.ZodType>(
  path: string,
  schema: Schema,
  fallback: z.output<Schema>,
) => {
  if (!(await exists(path))) {
    return fallback
  }
  return readJsonFile(
    path,
    schema,
    (problem, options) => new ExpectedError(`${path} ${problem}`, options),
  )
}

/** Loads every plugin directory directly inside a directory, sorted by directory name. */
const loadPluginsIn = async (directory: string): Promise<LoadedPlugin[]> => {
  const names = await listDirectories(directory)
  return Promise.all(names.map((name) => loadPlugin(join(directory, name))))
}

const assertInGroup = (directory: string, group: string, plugins: LoadedPlugin[]): void => {
  for (const plugin of plugins) {
    const expected = plugin.manifest.category ?? EXTRAS_DIRECTORY
    if (expected !== group) {
      throw new PluginLoadError(plugin.directory, `it belongs in ${join(directory, expected)}`)
    }
  }
}

/**
 * Loads the plugins grouped in one directory per category, and those without a category from
 * `extras/`. A plugin in the directory of another category fails.
 */
const loadGroupedPlugins = async (directory: string): Promise<LoadedPlugin[]> => {
  const groups = await listDirectories(directory)
  const plugins: LoadedPlugin[] = []
  for (const group of groups) {
    const inGroup = await loadPluginsIn(join(directory, group))
    assertInGroup(directory, group, inGroup)
    plugins.push(...inGroup)
  }
  assertUniqueNames(plugins)
  return plugins
}

/**
 * Loads the assets from a directory with `base/`, `plugins/<category>/`, `categories.json` and
 * `catalog.json`; each of them may be missing.
 */
export const loadAssets = async (directory: string): Promise<Assets> => {
  const baseDirectory = join(directory, BASE_DIRECTORY)
  const pluginsDirectory = join(directory, PLUGINS_DIRECTORY)
  return {
    base: (await exists(baseDirectory)) ? await loadPlugin(baseDirectory) : undefined,
    plugins: (await exists(pluginsDirectory)) ? await loadGroupedPlugins(pluginsDirectory) : [],
    categories: await readJson(join(directory, CATEGORIES_FILE), categoriesSchema, []),
    catalog: await readJson(join(directory, CATALOG_FILE), versionCatalogSchema, {}),
  }
}
