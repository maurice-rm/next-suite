import { processRemoteEnvironment, processUserConfigPath } from './process-environment.ts'
import { runNextSuite } from './run-next-suite.ts'

/** Runs next-suite in this process, with its terminal and environment. */
export const startNextSuite = async ({ cliVersion }: { cliVersion: string }): Promise<number> =>
  runNextSuite({
    argv: process.argv.slice(2),
    cliVersion,
    cwd: process.cwd(),
    output: process.stdout,
    error: process.stderr,
    remote: processRemoteEnvironment(),
    userConfigPath: processUserConfigPath(),
  })
