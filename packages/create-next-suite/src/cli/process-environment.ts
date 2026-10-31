import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

import type { RemoteEnvironment } from '../loader/remote/remote-source.ts'
import { userConfigPath } from '../user-config/user-config.ts'

/**
 * A GitHub token from the environment or the GitHub CLI; the token never leaves this process.
 * The CLI runs in a fresh, empty directory of the cache: Windows looks for a program in the
 * current directory before PATH, and the current directory may be a project someone else wrote.
 */
const githubToken = (cacheDir: string): string | undefined => {
  const fromEnvironment = process.env.GH_TOKEN || process.env.GITHUB_TOKEN
  if (fromEnvironment) {
    return fromEnvironment
  }
  let emptyDirectory: string | undefined
  try {
    mkdirSync(cacheDir, { recursive: true })
    emptyDirectory = mkdtempSync(join(cacheDir, '.gh-'))
    return (
      execFileSync('gh', ['auth', 'token'], {
        cwd: emptyDirectory,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim() || undefined
    )
  } catch {
    return undefined
  } finally {
    if (emptyDirectory !== undefined) {
      rmSync(emptyDirectory, { recursive: true, force: true })
    }
  }
}

/**
 * Overrides what a project's devDependency on create-next-suite names, such as the tarball of a
 * build that is not published yet; the matrix of generated projects installs it this way.
 */
const CLI_SPECIFIER_VARIABLE = 'NEXT_SUITE_CLI_SPECIFIER'

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

/** What a project's devDependency on create-next-suite names: the running version by default. */
export const processCliSpecifier = (cliVersion: string): string =>
  process.env[CLI_SPECIFIER_VARIABLE] || cliVersion
