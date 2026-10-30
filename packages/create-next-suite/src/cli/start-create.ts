import { runCommand } from '../post-steps/run-command.ts'
import { loadBuiltInAssets } from './built-in-assets.ts'
import { fetchLatestVersion } from './fetch-latest-version.ts'
import { processRemoteEnvironment, processUserConfigPath } from './process-environment.ts'
import { runCreate } from './run-create.ts'

const DEFAULT_COLUMNS = 80

/**
 * Runs create-next-suite in this process, with its terminal and environment, and the built-in
 * plugins from the package root. Built-in and external plugins import `create-next-suite/plugin`
 * from `pluginEntry`, the entry next to the running one.
 */
export const startCreate = ({
  cliVersion,
  packageRoot,
  pluginEntry,
}: {
  cliVersion: string
  packageRoot: string
  pluginEntry: string
}): Promise<number> =>
  runCreate({
    argv: process.argv.slice(2),
    loadAssets: () => loadBuiltInAssets(packageRoot, pluginEntry),
    pluginEntry,
    remote: processRemoteEnvironment(),
    userConfigPath: processUserConfigPath(),
    cliVersion,
    cwd: process.cwd(),
    streams: { input: process.stdin, output: process.stdout, error: process.stderr },
    isInteractive: process.stdin.isTTY === true && process.stdout.isTTY === true,
    columns: process.stdout.columns ?? DEFAULT_COLUMNS,
    now: () => new Date(),
    userAgent: process.env.npm_config_user_agent,
    runCommand,
    fetchLatestVersion,
  })
