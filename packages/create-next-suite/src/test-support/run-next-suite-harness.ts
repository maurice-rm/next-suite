import { join } from 'node:path'
import { PassThrough } from 'node:stream'
import { fileURLToPath } from 'node:url'

import ansis from 'ansis'

import { type BuiltInAssets, loadBuiltInAssets } from '../cli/built-in-assets.ts'
import type { NextSuiteEnvironment } from '../cli/next-suite-environment.ts'
import { runNextSuite } from '../cli/run-next-suite.ts'
import { collectOutput } from './collect-output.ts'
import { stubRemote } from './stub-remote.ts'

const CLI_VERSION = '2.0.0'
const PACKAGE_ROOT = fileURLToPath(new URL('../..', import.meta.url))
const PLUGIN_ENTRY = fileURLToPath(new URL('../plugin.ts', import.meta.url))
const CONFIG_ENTRY = fileURLToPath(new URL('../config.ts', import.meta.url))

/** What a run of next-suite printed and answered, with colours stripped. */
export type NextSuiteRun = { exitCode: number; output: string; error: string }

let assets: Promise<BuiltInAssets> | undefined

/** The built-in assets, loaded once for every test of a file. */
const loadAssetsOnce = (): Promise<BuiltInAssets> => {
  assets ??= loadBuiltInAssets(PACKAGE_ROOT, PLUGIN_ENTRY)
  return assets
}

/**
 * Runs next-suite in `cwd` with the built-in plugins, no terminal, no network and a user
 * configuration in `root`; commands fail and no published version runs unless `overrides` says
 * otherwise.
 */
export const runNextSuiteIn = async (
  { root, cwd }: { root: string; cwd: string },
  argv: readonly string[],
  overrides: Partial<NextSuiteEnvironment> = {},
): Promise<NextSuiteRun> => {
  const output = collectOutput()
  const error = collectOutput()
  const exitCode = await runNextSuite({
    argv,
    cliVersion: CLI_VERSION,
    cliSpecifier: CLI_VERSION,
    cwd,
    input: new PassThrough(),
    output: output.stream,
    error: error.stream,
    isInteractive: false,
    remote: stubRemote(root),
    userConfigPath: join(root, 'config.json'),
    loadAssets: loadAssetsOnce,
    pluginEntry: PLUGIN_ENTRY,
    configEntry: CONFIG_ENTRY,
    runCommand: async () => ({ isSuccess: false, output: 'commands do not run here' }),
    runPublishedGenerator: async () => ({ isSuccess: false, output: 'no published version here' }),
    ...overrides,
  })
  return { exitCode, output: ansis.strip(output.text()), error: ansis.strip(error.text()) }
}
