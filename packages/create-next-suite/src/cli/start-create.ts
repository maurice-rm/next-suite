import { loadAssets } from '../loader/load-assets.ts'
import { runCommand } from '../post-steps/run-command.ts'
import { fetchLatestVersion } from './fetch-latest-version.ts'
import { runCreate } from './run-create.ts'

const DEFAULT_COLUMNS = 80

/**
 * Runs create-next-suite in this process, with its terminal and environment, and the built-in
 * plugins from the package root.
 */
export const startCreate = async ({
  cliVersion,
  packageRoot,
}: {
  cliVersion: string
  packageRoot: string
}): Promise<number> =>
  runCreate({
    argv: process.argv.slice(2),
    assets: await loadAssets(packageRoot),
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
