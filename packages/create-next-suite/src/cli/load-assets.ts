import { readdir, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'

import * as z from 'zod'

import type { VersionCatalog } from '../compose/merge-contributions.ts'
import { type Category, categoriesSchema } from '../contract/category.ts'
import { type LoadedPlugin, loadPlugin } from '../loader/load-plugin.ts'
import { loadPlugins } from '../loader/load-plugins.ts'
import { PluginLoadError } from '../loader/plugin-load-error.ts'

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

const catalogSchema = z.record(z.string(), z.string())

/** The folder of the plugins without a category; every other folder is named after a category. */
const EXTRAS_FOLDER = 'extras'

const exists = async (path: string): Promise<boolean> =>
  stat(path).then(
    () => true,
    (error: unknown) => {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
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
  return schema.parse(JSON.parse(await readFile(path, 'utf8')))
}

const assertInGroup = (directory: string, group: string, plugins: LoadedPlugin[]): void => {
  for (const { manifest, folder } of plugins) {
    const expected = manifest.category ?? EXTRAS_FOLDER
    if (expected !== group) {
      throw new PluginLoadError(folder, `it belongs in ${join(directory, expected)}`)
    }
  }
}

const assertUniqueNames = (directory: string, plugins: LoadedPlugin[]): void => {
  const names = plugins.map((plugin) => plugin.manifest.name)
  const twice = names.find((name, index) => names.indexOf(name) !== index)
  if (twice !== undefined) {
    throw new PluginLoadError(directory, `two plugins are named ${twice}`)
  }
}

/**
 * Loads the plugins grouped in one folder per category, and those without a category from
 * `extras/`. A plugin in the folder of another category fails.
 */
const loadGroupedPlugins = async (directory: string): Promise<LoadedPlugin[]> => {
  const entries = await readdir(directory, { withFileTypes: true })
  const groups = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
  const plugins: LoadedPlugin[] = []
  for (const group of groups) {
    const inGroup = await loadPlugins(join(directory, group))
    assertInGroup(directory, group, inGroup)
    plugins.push(...inGroup)
  }
  assertUniqueNames(directory, plugins)
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
    catalog: await readJson(join(directory, 'catalog.json'), catalogSchema, {}),
  }
}
