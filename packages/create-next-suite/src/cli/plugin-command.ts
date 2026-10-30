import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'

import type { Command } from 'commander'
import * as z from 'zod'

import { readJsonFile } from '../file-system/read-json-file.ts'
import { fetchExternalPlugin } from '../loader/fetch-external-plugin.ts'
import { loadExternalPlugin } from '../loader/load-external-plugin.ts'
import { PluginLoadError } from '../loader/plugin-load-error.ts'
import { CATEGORIES } from '../plugin-definition/categories.ts'
import type { PluginSummary } from '../plugin-definition/plugin-metadata.ts'
import type { NextSuiteEnvironment, Report } from './next-suite-environment.ts'

const PACKAGE_FILE = 'package.json'
/** The package whose types `definePlugin` and the points come with. */
const CONTRACT_PACKAGE = 'create-next-suite'

const dependencyMap = z.record(z.string(), z.string()).optional()
const packageSchema = z.looseObject({
  dependencies: dependencyMap,
  devDependencies: dependencyMap,
  peerDependencies: dependencyMap,
})

/** Fails for a plugin of a category create-next-suite does not ask. */
const assertKnownCategory = ({ metadata }: PluginSummary, location: string): void => {
  if (metadata.category === undefined || CATEGORIES.some(({ id }) => id === metadata.category)) {
    return
  }
  const known = CATEGORIES.map(({ id }) => id).join(', ')
  throw new PluginLoadError(
    location,
    `it belongs to the unknown category ${metadata.category}; the categories are ${known}, or none for an extra`,
  )
}

/**
 * Hints about the plugin's package.json that need no type check: where create-next-suite, whose
 * types a plugin is checked with, belongs.
 */
const findPackageHints = async (directory: string): Promise<string[]> => {
  const path = join(directory, PACKAGE_FILE)
  if (!existsSync(path)) {
    return [
      `add a ${PACKAGE_FILE} with ${CONTRACT_PACKAGE} under devDependencies to type-check plugin.ts`,
    ]
  }
  const fields = await readJsonFile(
    path,
    packageSchema,
    (problem, options) => new PluginLoadError(directory, `its ${PACKAGE_FILE} ${problem}`, options),
  )
  if (fields.dependencies?.[CONTRACT_PACKAGE] !== undefined) {
    return [
      `${CONTRACT_PACKAGE} is under dependencies, so it is installed with the plugin; move it to devDependencies or peerDependencies`,
    ]
  }
  const isListed =
    fields.devDependencies?.[CONTRACT_PACKAGE] !== undefined ||
    fields.peerDependencies?.[CONTRACT_PACKAGE] !== undefined
  return isListed ? [] : [`add ${CONTRACT_PACKAGE} under devDependencies to type-check plugin.ts`]
}

const describeNames = (label: string, names: readonly string[]): string[] =>
  names.length === 0 ? [] : [`  ${label}: ${names.join(', ')}`]

const describeSummary = ({ metadata, points }: PluginSummary): string[] => [
  `  category: ${metadata.category ?? `none, an extra${metadata.section === undefined ? '' : ` in ${metadata.section}`}`}`,
  ...describeNames('options', Object.keys(metadata.options ?? {})),
  ...describeNames('uses', points.uses),
  ...describeNames('provides', [...points.provides, ...points.collects]),
  ...describeNames('extends', points.extend),
  ...(metadata.replaces === undefined ? [] : [`  replaces: ${metadata.replaces}`]),
]

/**
 * Checks the plugin in a directory the way create-next-suite loads it: its files, its metadata
 * read without running it, its category, then its dependencies installed and its `plugin.ts` run
 * on its own, with the metadata it exports compared to what was read.
 *
 * @throws PluginLoadError naming the first problem.
 */
const validatePlugin = async (
  environment: NextSuiteEnvironment,
  directory: string,
): Promise<string> => {
  const path = resolve(environment.cwd, directory)
  const fetched = await fetchExternalPlugin(path, {
    cwd: environment.cwd,
    remote: environment.remote,
    registries: {},
  })
  assertKnownCategory(fetched.summary, path)
  await loadExternalPlugin(fetched, {
    pluginEntry: environment.pluginEntry,
    cacheDir: environment.remote.cacheDir,
    runCommand: environment.runCommand,
  })
  const { name, title } = fetched.summary.metadata
  const hints = (await findPackageHints(path)).map((hint) => `hint: ${hint}`)
  return [
    `${name} (${title}) is a valid plugin`,
    ...describeSummary(fetched.summary),
    ...hints,
  ].join('\n')
}

export const addPluginCommand = (
  program: Command,
  environment: NextSuiteEnvironment,
  report: Report,
): void => {
  program
    .command('plugin')
    .description('Work on plugins.')
    .command('validate <directory>')
    .description('check that a directory is a valid plugin, running its plugin.ts on its own')
    .action(async (directory: string) => report(await validatePlugin(environment, directory)))
}
