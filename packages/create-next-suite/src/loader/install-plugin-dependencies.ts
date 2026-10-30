import { existsSync } from 'node:fs'
import { cp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import * as z from 'zod'

import { readJsonFile } from '../file-system/read-json-file.ts'
import { PluginLoadError } from './plugin-load-error.ts'
import { fillCacheOnce } from './remote/cache.ts'

const PACKAGE_FILE = 'package.json'
const LOCKFILE = 'package-lock.json'
/** npm settings of the plugin itself, such as another registry, which an install never reads. */
const NPM_SETTINGS_FILE = '.npmrc'
const INSTALLED_CACHE = 'installed'
const NPM = 'npm'
/**
 * No install script of any dependency runs, and packages the npm cache holds are taken without
 * asking the registry again.
 */
const INSTALL_FLAGS = [
  '--ignore-scripts',
  '--prefer-offline',
  '--no-audit',
  '--no-fund',
  '--no-bin-links',
  '--loglevel=error',
]
/** How many characters of npm's output a failure shows. */
const MAX_OUTPUT_LENGTH = 2000

const packageSchema = z.looseObject({
  dependencies: z.record(z.string(), z.string()).optional(),
  optionalDependencies: z.record(z.string(), z.string()).optional(),
})

/** Runs a command in a directory and answers how it ended, as the core runs commands. */
export type InstallRunner = (
  command: string,
  args: readonly string[],
  cwd: string,
) => Promise<{ isSuccess: boolean; output: string }>

/** Where a plugin's dependencies go, how npm runs, and the name of the plugin in errors. */
type InstallContext = { cacheDir: string; runCommand: InstallRunner; location: string }

/** The dependencies a plugin needs when it runs, as its package.json names them. */
type RunDependencies = z.output<typeof packageSchema>

const readRunDependencies = async (
  directory: string,
  location: string,
): Promise<RunDependencies> => {
  const path = join(directory, PACKAGE_FILE)
  if (!existsSync(path)) {
    return {}
  }
  const { dependencies, optionalDependencies } = await readJsonFile(
    path,
    packageSchema,
    (problem, options) => new PluginLoadError(location, `its ${PACKAGE_FILE} ${problem}`, options),
  )
  return {
    ...(dependencies === undefined ? {} : { dependencies }),
    ...(optionalDependencies === undefined ? {} : { optionalDependencies }),
  }
}

const hasAny = ({ dependencies = {}, optionalDependencies = {} }: RunDependencies): boolean =>
  Object.keys({ ...dependencies, ...optionalDependencies }).length > 0

/** The npm command that installs a plugin's dependencies: from its lockfile when it ships one. */
const installArgs = (directory: string): string[] =>
  existsSync(join(directory, LOCKFILE))
    ? ['ci', ...INSTALL_FLAGS]
    : ['install', '--no-package-lock', ...INSTALL_FLAGS]

/**
 * Installs into a copy whose package.json keeps only the dependencies the plugin runs with: npm
 * resolves devDependencies and peers too, which would fetch packages such as create-next-suite
 * itself. `npm ci` accepts a lockfile that also locks them, and leaves them out.
 */
const install = async (
  target: string,
  dependencies: RunDependencies,
  { runCommand, location }: InstallContext,
) => {
  await rm(join(target, NPM_SETTINGS_FILE), { force: true })
  await writeFile(
    join(target, PACKAGE_FILE),
    `${JSON.stringify({ private: true, ...dependencies }, null, 2)}\n`,
  )
  const result = await runCommand(NPM, installArgs(target), target)
  if (!result.isSuccess) {
    throw new PluginLoadError(
      location,
      `installing the dependencies of its ${PACKAGE_FILE} with npm failed:\n${result.output.trim().slice(-MAX_OUTPUT_LENGTH)}`,
    )
  }
}

/**
 * The directory a trusted plugin runs from. A plugin whose `package.json` names dependencies gets
 * a copy of its snapshot in the cache with them installed by npm, one directory per content hash:
 * with `npm ci` from the `package-lock.json` the plugin ships, whose integrity npm checks, or with
 * `npm install` from the ranges otherwise. Only `dependencies` and `optionalDependencies` are
 * installed, no install script runs, and the plugin's `.npmrc` is left out. A plugin without
 * dependencies runs from its snapshot.
 *
 * @throws PluginLoadError for an invalid `package.json` or an install that fails, with npm's output.
 */
export const installPluginDependencies = async (
  snapshot: { directory: string; contentHash: string },
  context: InstallContext,
): Promise<string> => {
  const dependencies = await readRunDependencies(snapshot.directory, context.location)
  if (!hasAny(dependencies)) {
    return snapshot.directory
  }
  return fillCacheOnce(
    context.cacheDir,
    [INSTALLED_CACHE, snapshot.contentHash],
    async (target) => {
      await cp(snapshot.directory, target, { recursive: true })
      await install(target, dependencies, context)
    },
  )
}
