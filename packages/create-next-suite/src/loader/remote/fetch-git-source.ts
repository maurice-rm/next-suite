import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, rename, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'

import { errorCodeOf } from '../../file-system/error-code.ts'
import { PluginLoadError } from '../plugin-load-error.ts'
import { fillCacheOnce } from './cache.ts'
import { COMMIT_ID } from './commit-id.ts'
import type { FetchedSource, RemoteAddress, RemoteEnvironment } from './remote-source.ts'

/**
 * Git options that keep a clone from leaving the transports below or writing links. Commands of
 * the git configuration are switched off apart: see `commandsSwitchedOff`.
 */
const GIT_HARDENING = [
  '-c',
  'core.symlinks=false',
  '-c',
  'core.protectNTFS=true',
  '-c',
  'core.protectHFS=true',
  '-c',
  'protocol.allow=never',
  '-c',
  'protocol.https.allow=always',
  '-c',
  'protocol.ssh.allow=always',
  '-c',
  'protocol.file.allow=always',
  '-c',
  'core.fsmonitor=false',
  '-c',
  'submodule.recurse=false',
  '-c',
  'fetch.recurseSubmodules=false',
]
/** Installed by git-lfs into the global configuration; switched off even where it is not listed. */
const LFS_FILTER = 'lfs'
/** The commands of a filter driver, set empty so none runs; a required filter would then fail. */
const FILTER_COMMANDS = ['smudge', 'clean', 'process']
const FILTER_KEY = /^filter\.(.+)\.[^.]+$/
const NO_HOOKS = 'no-hooks'

/** Makes ssh fail instead of asking for a password or to accept an unknown host key. */
const SSH_BATCH_MODE = '-o BatchMode=yes'
const DEFAULT_SSH_COMMAND = 'ssh'
/** The exit code of `git config --get` for a key that is not set. */
const CONFIG_KEY_MISSING = '1'

type GitAddress = Extract<RemoteAddress, { kind: 'git' }>
type Git = (args: string[]) => Promise<{ stdout: string }>

const execFileAsync = promisify(execFile)

/** What `git config` prints for its arguments, or nothing for a key that is not set. */
const readGitConfig = async (args: readonly string[], cwd: string): Promise<string> => {
  try {
    const { stdout } = await execFileAsync('git', ['config', ...args], { cwd })
    return stdout.trim()
  } catch (error) {
    if (errorCodeOf(error) === CONFIG_KEY_MISSING) {
      return ''
    }
    throw error
  }
}

const configuredSshCommand = async (cwd: string): Promise<string> =>
  (await readGitConfig(['--get', 'core.sshCommand'], cwd)) || DEFAULT_SSH_COMMAND

/** The filter drivers the git configuration defines, which a `.gitattributes` may name. */
const configuredFilterDrivers = async (cwd: string): Promise<Set<string>> => {
  const keys = (await readGitConfig(['--name-only', '--get-regexp', '^filter\\.'], cwd)).split('\n')
  const drivers = keys.flatMap((key) => FILTER_KEY.exec(key)?.[1] ?? [])
  return new Set([LFS_FILTER, ...drivers])
}

/**
 * Options that switch off what the git configuration would run while cloning and checking out:
 * hooks, through an empty hooks directory, and every filter driver, by emptying its commands and
 * making it optional. A repository picks filters through its `.gitattributes`, so its content
 * could otherwise reach programs such as git-lfs before it is trusted (git-scm.com/docs/gitattributes).
 */
const commandsSwitchedOff = async (scratch: string): Promise<string[]> => {
  const hooks = join(scratch, NO_HOOKS)
  await mkdir(hooks)
  const filters = [...(await configuredFilterDrivers(scratch))].flatMap((driver) => [
    ...FILTER_COMMANDS.flatMap((command) => ['-c', `filter.${driver}.${command}=`]),
    '-c',
    `filter.${driver}.required=false`,
  ])
  return ['-c', `core.hooksPath=${hooks}`, ...filters]
}

/**
 * The environment git runs in: it never prompts, git-lfs skips its smudge filter even when run,
 * and ssh runs in batch mode on top of the user's own ssh command. `GIT_SSH` names a program without arguments, so it is left as it is.
 */
const gitEnvironment = async (cwd: string): Promise<NodeJS.ProcessEnv> => {
  const environment = { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_LFS_SKIP_SMUDGE: '1' }
  if (process.env.GIT_SSH_COMMAND === undefined && process.env.GIT_SSH !== undefined) {
    return environment
  }
  const sshCommand = process.env.GIT_SSH_COMMAND ?? (await configuredSshCommand(cwd))
  return { ...environment, GIT_SSH_COMMAND: `${sshCommand} ${SSH_BATCH_MODE}` }
}

/** How git runs: its environment, the options that switch commands off, and its directory. */
type GitSettings = { env: NodeJS.ProcessEnv; switchedOff: readonly string[]; cwd: string }

/**
 * Runs git in a directory of the cache rather than the current one: Windows looks for a program
 * in the current directory before PATH, and that may be a project someone else wrote.
 */
const gitWith =
  ({ env, switchedOff, cwd }: GitSettings): Git =>
  (args) =>
    execFileAsync('git', [...GIT_HARDENING, ...switchedOff, ...args], { env, cwd })

/**
 * Clones the ref of a repository into a directory: a branch or tag directly, a commit by fetching
 * it.
 */
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
    const git = gitWith({
      env: await gitEnvironment(scratch),
      switchedOff: await commandsSwitchedOff(scratch),
      cwd: scratch,
    })
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
