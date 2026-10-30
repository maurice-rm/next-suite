import { execFileSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

import type { RemoteEnvironment } from '../loader/remote/remote-source.ts'
import { userConfigPath } from '../user-config/user-config.ts'

/**
 * A GitHub token from the environment or the GitHub CLI; the token never leaves this process.
 * The CLI runs in the cache directory: Windows looks for a program in the current directory
 * before PATH, and the current directory may be a project someone else wrote.
 */
const githubToken = (cacheDir: string): string | undefined => {
  const fromEnvironment = process.env.GH_TOKEN || process.env.GITHUB_TOKEN
  if (fromEnvironment) {
    return fromEnvironment
  }
  try {
    mkdirSync(cacheDir, { recursive: true })
    return (
      execFileSync('gh', ['auth', 'token'], {
        cwd: cacheDir,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim() || undefined
    )
  } catch {
    return undefined
  }
}

const cacheDirOf = (): string =>
  join(process.env.XDG_CACHE_HOME ?? join(homedir(), '.cache'), 'next-suite', 'plugins')

/**
 * How this process fetches plugins: the global fetch, the XDG cache directory and access tokens.
 * The GitHub token is looked up once, on first use, since asking the GitHub CLI starts a process.
 */
export const processRemoteEnvironment = (): RemoteEnvironment => {
  const cacheDir = cacheDirOf()
  let github: { token: string | undefined } | undefined
  const githubTokenOnce = (): string | undefined => {
    github ??= { token: githubToken(cacheDir) }
    return github.token
  }
  return {
    fetch,
    cacheDir,
    tokenFor: (host) =>
      host === 'github' ? githubTokenOnce() : process.env.GITLAB_TOKEN || undefined,
    npmRegistry: process.env.npm_config_registry,
  }
}

export const processUserConfigPath = (): string => userConfigPath(process.env, homedir())
