import { stat } from 'node:fs/promises'
import { join } from 'node:path'

import type * as z from 'zod'

import { type Category, categoriesSchema } from '../contract/category.ts'
import { type VersionCatalog, versionCatalogSchema } from '../contract/version-catalog.ts'
import { ExpectedError } from '../expected-error.ts'
import { isMissingFileError } from '../file-system/error-code.ts'
import { listFolders } from '../file-system/list-folders.ts'
import { readJsonFile } from '../file-system/read-json-file.ts'
import { type LoadedPlugin, loadPlugin } from './load-plugin.ts'
import { assertUniqueNames, loadPlugins } from './load-plugins.ts'
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

/** The folder of the plugins without a category; every other folder is named after a category. */
const EXTRAS_FOLDER = 'extras'

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

const assertInGroup = (directory: string, group: string, plugins: LoadedPlugin[]): void => {
  for (const { manifest, folder } of plugins) {
    const expected = manifest.category ?? EXTRAS_FOLDER
    if (expected !== group) {
      throw new PluginLoadError(folder, `it belongs in ${join(directory, expected)}`)
    }
  }
}

/**
 * Loads the plugins grouped in one folder per category, and those without a category from
 * `extras/`. A plugin in the folder of another category fails.
 */
const loadGroupedPlugins = async (directory: string): Promise<LoadedPlugin[]> => {
  const groups = await listFolders(directory)
  const plugins: LoadedPlugin[] = []
  for (const group of groups) {
    const inGroup = await loadPlugins(join(directory, group))
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
  const baseDirectory = join(directory, 'base')
  const pluginsDirectory = join(directory, 'plugins')
  return {
    base: (await exists(baseDirectory)) ? await loadPlugin(baseDirectory) : undefined,
    plugins: (await exists(pluginsDirectory)) ? await loadGroupedPlugins(pluginsDirectory) : [],
    categories: await readJson(join(directory, 'categories.json'), categoriesSchema, []),
    catalog: await readJson(join(directory, 'catalog.json'), versionCatalogSchema, {}),
  }
}
