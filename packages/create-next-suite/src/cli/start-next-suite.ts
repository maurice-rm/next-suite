import { runCommand } from '../post-steps/run-command.ts'
import { loadBuiltInAssets } from './built-in-assets.ts'
import {
  processCliSpecifier,
  processRemoteEnvironment,
  processUserConfigPath,
} from './process-environment.ts'
import { runNextSuite } from './run-next-suite.ts'
import { createPublishedGeneratorRunner } from './run-published-generator.ts'

/**
 * Runs next-suite in this process, with its terminal and environment, and the built-in plugins
 * from the package root. A plugin imports `create-next-suite/plugin` from `pluginEntry`, a
 * project's config `create-next-suite/config` from `configEntry`, both entries next to the
 * running one.
 */
export const startNextSuite = async ({
  cliVersion,
  packageRoot,
  pluginEntry,
  configEntry,
}: {
  cliVersion: string
  packageRoot: string
  pluginEntry: string
  configEntry: string
}): Promise<number> =>
  runNextSuite({
    argv: process.argv.slice(2),
    cliVersion,
    cliSpecifier: processCliSpecifier(cliVersion),
    cwd: process.cwd(),
    input: process.stdin,
    output: process.stdout,
    error: process.stderr,
    isInteractive: process.stdin.isTTY === true && process.stdout.isTTY === true,
    remote: processRemoteEnvironment(),
    userConfigPath: processUserConfigPath(),
    loadAssets: () => loadBuiltInAssets(packageRoot, pluginEntry),
    pluginEntry,
    configEntry,
    runCommand,
    runPublishedGenerator: createPublishedGeneratorRunner(runCommand),
  })
