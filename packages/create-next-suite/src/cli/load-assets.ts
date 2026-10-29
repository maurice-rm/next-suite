import { readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'

import * as z from 'zod'

import type { VersionCatalog } from '../compose/merge-contributions.ts'
import { type Category, categoriesSchema } from '../contract/category.ts'
import { type LoadedPlugin, loadPlugin } from '../loader/load-plugin.ts'
import { loadPlugins } from '../loader/load-plugins.ts'

/** What ships with create-next-suite: the base project, the built-in plugins, their categories and versions. */
export type Assets = {
  base: LoadedPlugin
  plugins: LoadedPlugin[]
  categories: Category[]
  catalog: VersionCatalog
}

const catalogSchema = z.record(z.string(), z.string())

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

/** Loads the assets from a directory with `base/`, `plugins/`, `categories.json` and `catalog.json`. */
export const loadAssets = async (directory: string): Promise<Assets> => {
  const pluginsDirectory = join(directory, 'plugins')
  return {
    base: await loadPlugin(join(directory, 'base')),
    plugins: (await exists(pluginsDirectory)) ? await loadPlugins(pluginsDirectory) : [],
    categories: await readJson(join(directory, 'categories.json'), categoriesSchema, []),
    catalog: await readJson(join(directory, 'catalog.json'), catalogSchema, {}),
  }
}
