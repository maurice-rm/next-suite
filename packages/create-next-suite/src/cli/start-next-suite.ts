import { runCommand } from '../post-steps/run-command.ts'
import { processRemoteEnvironment, processUserConfigPath } from './process-environment.ts'
import { runNextSuite } from './run-next-suite.ts'

/**
 * Runs next-suite in this process, with its terminal and environment; a plugin it validates
 * imports `create-next-suite/plugin` from `pluginEntry`, the entry next to the running one.
 */
export const startNextSuite = async ({
  cliVersion,
  pluginEntry,
}: {
  cliVersion: string
  pluginEntry: string
}): Promise<number> =>
  runNextSuite({
    argv: process.argv.slice(2),
    cliVersion,
    cwd: process.cwd(),
    output: process.stdout,
    error: process.stderr,
    remote: processRemoteEnvironment(),
    userConfigPath: processUserConfigPath(),
    pluginEntry,
    runCommand,
  })
