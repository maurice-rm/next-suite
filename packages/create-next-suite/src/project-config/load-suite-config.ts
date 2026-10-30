import { readFile } from 'node:fs/promises'
import { dirname } from 'node:path'

import { createJiti } from 'jiti'
import * as z from 'zod'

import { parseWith } from '../file-system/read-json-file.ts'
import { createPluginModule, type LoadedPluginModule } from '../loader/load-plugin-module.ts'
import type { Plugin } from '../plugin-definition/plugin-definition.ts'
import { ProjectConfigError } from './project-config-error.ts'
import { CONFIG_MODULE } from './project-paths.ts'
import type { SuiteConfig } from './suite-config.ts'

/** The module plugins import `definePlugin` from. */
const PLUGIN_CONTRACT = 'create-next-suite/plugin'

/** A plugin defined in place: what `definePlugin` returns, its fields run as given. */
const inlinePluginSchema = z.looseObject({
  name: z.string().min(1),
  title: z.string().min(1),
})

const suiteConfigSchema = z.strictObject({
  project: z.strictObject({
    name: z.string().min(1),
    srcDir: z.boolean().optional(),
    importAlias: z.string().optional(),
    reactCompiler: z.boolean().optional(),
    cacheComponents: z.boolean().optional(),
  }),
  plugins: z.array(z.union([z.string().min(1), inlinePluginSchema])),
  disable: z.array(z.string()).optional(),
  answers: z.record(z.string(), z.record(z.string(), z.unknown())).optional(),
})

/** Where the entries of the running create-next-suite lie, which the config and its plugins import. */
type Entries = { configEntry: string; pluginEntry: string }

/** A project's config as loaded: where it lies, its text, what it says and its inline plugins. */
export type LoadedSuiteConfig = {
  path: string
  /** The directory of the config, which its paths are relative to. */
  directory: string
  /** The config's text as written, which a project created from it gets unchanged. */
  text: string
  config: SuiteConfig
  /** The plugins the config defines in place; their file sources lie in its directory. */
  inlinePlugins: LoadedPluginModule[]
}

const readText = async (path: string): Promise<string> => {
  try {
    return await readFile(path, 'utf8')
  } catch (error) {
    throw new ProjectConfigError(`cannot read ${path}`, { cause: error })
  }
}

const run = async (path: string, { configEntry, pluginEntry }: Entries): Promise<unknown> => {
  const jiti = createJiti(import.meta.url, {
    fsCache: false,
    moduleCache: false,
    alias: { [CONFIG_MODULE]: configEntry, [PLUGIN_CONTRACT]: pluginEntry },
  })
  try {
    return await jiti.import(path, { default: true })
  } catch (error) {
    throw new ProjectConfigError(`${path} does not run`, { cause: error })
  }
}

/**
 * Loads a project's `next-suite.config.ts`, which runs its code: its imports of
 * `create-next-suite/config` and `create-next-suite/plugin` go to the running create-next-suite.
 * The config is checked for its shape; names and answers are checked against the plugins later.
 *
 * @throws ProjectConfigError for a config that cannot be read, does not run or has the wrong
 * shape.
 */
export const loadSuiteConfig = async (
  path: string,
  entries: Entries,
): Promise<LoadedSuiteConfig> => {
  const text = await readText(path)
  const config: SuiteConfig = parseWith(
    await run(path, entries),
    suiteConfigSchema,
    (problem, options) => new ProjectConfigError(`${path} ${problem}`, options),
  ) as SuiteConfig
  const directory = dirname(path)
  const inlinePlugins = config.plugins
    .filter((entry): entry is Plugin => typeof entry !== 'string')
    .map((plugin) => createPluginModule(plugin, directory))
  return { path, directory, text, config, inlinePlugins }
}
