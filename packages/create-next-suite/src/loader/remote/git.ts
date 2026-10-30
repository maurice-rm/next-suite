import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, rename, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'

import { errorCodeOf } from '../../file-system/error-code.ts'
import { PluginLoadError } from '../plugin-load-error.ts'
import { fillCacheOnce } from './cache.ts'
import { COMMIT_ID } from './commit-id.ts'
import type { FetchedSource, RemoteAddress, RemoteEnvironment } from './remote-source.ts'

/** Git options that keep a clone from running anything or asking for a password. */
const GIT_HARDENING = [
  '-c',
  'core.symlinks=false',
  '-c',
  'protocol.allow=never',
  '-c',
  'protocol.https.allow=always',
  '-c',
  'protocol.ssh.allow=always',
  '-c',
  'protocol.file.allow=always',
]

/** Makes ssh fail instead of asking for a password or to accept an unknown host key. */
const SSH_BATCH_MODE = '-o BatchMode=yes'
const DEFAULT_SSH_COMMAND = 'ssh'
/** The exit code of `git config --get` for a key that is not set. */
const CONFIG_KEY_MISSING = '1'

type GitAddress = Extract<RemoteAddress, { kind: 'git' }>
type Git = (args: string[]) => Promise<{ stdout: string }>

const execFileAsync = promisify(execFile)

const configuredSshCommand = async (cwd: string): Promise<string> => {
  try {
    const { stdout } = await execFileAsync('git', ['config', '--get', 'core.sshCommand'], { cwd })
    return stdout.trim()
  } catch (error) {
    if (errorCodeOf(error) === CONFIG_KEY_MISSING) {
      return DEFAULT_SSH_COMMAND
    }
    throw error
  }
}

/**
 * The environment git runs in: it never prompts, and ssh runs in batch mode on top of the user's
 * own ssh command. `GIT_SSH` names a program without arguments, so it is left as it is.
 */
const gitEnvironment = async (cwd: string): Promise<NodeJS.ProcessEnv> => {
  const environment = { ...process.env, GIT_TERMINAL_PROMPT: '0' }
  if (process.env.GIT_SSH_COMMAND === undefined && process.env.GIT_SSH !== undefined) {
    return environment
  }
  const sshCommand = process.env.GIT_SSH_COMMAND ?? (await configuredSshCommand(cwd))
  return { ...environment, GIT_SSH_COMMAND: `${sshCommand} ${SSH_BATCH_MODE}` }
}

const gitWith =
  (env: NodeJS.ProcessEnv): Git =>
  (args) =>
    execFileAsync('git', [...GIT_HARDENING, ...args], { env })

/** Clones the ref of a repository into a directory: a branch or tag directly, a commit by fetching it. */
const cloneInto = async (git: Git, { url, ref }: GitAddress, directory: string) => {
  if (ref !== undefined && COMMIT_ID.test(ref)) {
    await git(['init', '--quiet', directory])
    await git(['-C', directory, 'fetch', '--quiet', '--depth', '1', '--', url, ref])
    await git(['-C', directory, 'checkout', '--quiet', 'FETCH_HEAD'])
    return
  }
  await git([
    'clone',
    '--quiet',
    '--depth',
    '1',
    ...(ref === undefined ? [] : ['--branch', ref]),
    '--',
    url,
    directory,
  ])
}

/** Clones a Git repository at its ref into the cache, without its history, by commit. */
export const fetchGitSource = async (
  environment: RemoteEnvironment,
  address: GitAddress,
): Promise<FetchedSource> => {
  const { url } = address
  await mkdir(environment.cacheDir, { recursive: true })
  const scratch = await mkdtemp(join(environment.cacheDir, '.clone-'))
  try {
    const git = gitWith(await gitEnvironment(scratch))
    const clone = join(scratch, 'clone')
    await cloneInto(git, address, clone)
    const { stdout } = await git(['-C', clone, 'rev-parse', 'HEAD'])
    const commit = stdout.trim()
    await rm(join(clone, '.git'), { recursive: true, force: true })
    const directory = await fillCacheOnce(environment.cacheDir, ['git', url, commit], (target) =>
      rename(clone, target),
    )
    return { directory, resolved: commit }
  } catch (error) {
    throw error instanceof PluginLoadError
      ? error
      : new PluginLoadError(url, 'cloning the repository failed', { cause: error })
  } finally {
    await rm(scratch, { recursive: true, force: true })
  }
}
