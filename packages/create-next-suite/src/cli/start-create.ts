import { execFileSync } from 'node:child_process'
import { homedir } from 'node:os'
import { join } from 'node:path'

import { loadAssets } from '../loader/load-assets.ts'
import { runCommand } from '../post-steps/run-command.ts'
import { userConfigPath } from '../trust/user-config.ts'
import { fetchLatestVersion } from './fetch-latest-version.ts'
import { runCreate } from './run-create.ts'

const DEFAULT_COLUMNS = 80

/** A GitHub token from the environment or the GitHub CLI; the token never leaves this process. */
const githubToken = (): string | undefined => {
  const fromEnvironment = process.env.GH_TOKEN || process.env.GITHUB_TOKEN
  if (fromEnvironment) {
    return fromEnvironment
  }
  try {
    return (
      execFileSync('gh', ['auth', 'token'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim() || undefined
    )
  } catch {
    return undefined
  }
}

const cacheDir = (): string =>
  join(process.env.XDG_CACHE_HOME ?? join(homedir(), '.cache'), 'next-suite', 'plugins')

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
    remote: {
      fetch,
      cacheDir: cacheDir(),
      tokenFor: (host) =>
        host === 'github' ? githubToken() : process.env.GITLAB_TOKEN || undefined,
      npmRegistry: process.env.npm_config_registry,
    },
    userConfigPath: userConfigPath(process.env, homedir()),
    fetchLatestVersion,
  })
