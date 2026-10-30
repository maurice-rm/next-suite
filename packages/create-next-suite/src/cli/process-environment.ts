import { execFileSync } from 'node:child_process'
import { homedir } from 'node:os'
import { join } from 'node:path'

import type { RemoteEnvironment } from '../loader/remote/remote-source.ts'
import { userConfigPath } from '../user-config/user-config.ts'

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

/** How this process fetches plugins: the global fetch, the XDG cache directory and access tokens. */
export const processRemoteEnvironment = (): RemoteEnvironment => ({
  fetch,
  cacheDir: cacheDir(),
  tokenFor: (host) => (host === 'github' ? githubToken() : process.env.GITLAB_TOKEN || undefined),
  npmRegistry: process.env.npm_config_registry,
})

/** Where this user's next-suite configuration lives. */
export const processUserConfigPath = (): string => userConfigPath(process.env, homedir())
