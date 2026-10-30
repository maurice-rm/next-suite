import { loadAssets } from '../loader/load-assets.ts'
import { runCommand } from '../post-steps/run-command.ts'
import { loadEngineV2Assets } from './engine-v2/engine-v2-assets.ts'
import { ENGINE_VARIABLE } from './engine-v2/select-engine.ts'
import { fetchLatestVersion } from './fetch-latest-version.ts'
import { processRemoteEnvironment, processUserConfigPath } from './process-environment.ts'
import { runCreate } from './run-create.ts'

const DEFAULT_COLUMNS = 80

/**
 * Runs create-next-suite in this process, with its terminal and environment, and the built-in
 * plugins from the package root. Plugins written as `plugin.ts` import `create-next-suite/plugin`
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
    loadAssets: () => loadAssets(packageRoot),
    cliVersion,
    cwd: process.cwd(),
    streams: { input: process.stdin, output: process.stdout, error: process.stderr },
    isInteractive: process.stdin.isTTY === true && process.stdout.isTTY === true,
    columns: process.stdout.columns ?? DEFAULT_COLUMNS,
    now: () => new Date(),
    userAgent: process.env.npm_config_user_agent,
    runCommand,
    remote: processRemoteEnvironment(),
    userConfigPath: processUserConfigPath(),
    fetchLatestVersion,
    engine: process.env[ENGINE_VARIABLE],
    loadEngineV2Assets: () => loadEngineV2Assets(packageRoot, pluginEntry),
  })
