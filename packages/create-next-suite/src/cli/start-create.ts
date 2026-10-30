import { runCommand } from '../post-steps/run-command.ts'
import { loadBuiltInAssets } from './built-in-assets.ts'
import { fetchLatestVersion } from './fetch-latest-version.ts'
import { processRemoteEnvironment, processUserConfigPath } from './process-environment.ts'
import { runCreate } from './run-create.ts'

const DEFAULT_COLUMNS = 80
/**
 * Overrides what a new project's devDependency on create-next-suite names, such as the tarball of
 * a build that is not published yet; the matrix of generated projects installs it this way.
 */
const CLI_SPECIFIER_VARIABLE = 'NEXT_SUITE_CLI_SPECIFIER'

/**
 * Runs create-next-suite in this process, with its terminal and environment, and the built-in
 * plugins from the package root. Built-in and external plugins import `create-next-suite/plugin`
 * from `pluginEntry`, a project's config `create-next-suite/config` from `configEntry`, both
 * entries next to the running one.
 */
export const startCreate = ({
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
  runCreate({
    argv: process.argv.slice(2),
    loadAssets: () => loadBuiltInAssets(packageRoot, pluginEntry),
    pluginEntry,
    configEntry,
    remote: processRemoteEnvironment(),
    userConfigPath: processUserConfigPath(),
    cliVersion,
    cliSpecifier: process.env[CLI_SPECIFIER_VARIABLE] || cliVersion,
    cwd: process.cwd(),
    streams: { input: process.stdin, output: process.stdout, error: process.stderr },
    isInteractive: process.stdin.isTTY === true && process.stdout.isTTY === true,
    columns: process.stdout.columns ?? DEFAULT_COLUMNS,
    userAgent: process.env.npm_config_user_agent,
    runCommand,
    fetchLatestVersion,
  })
