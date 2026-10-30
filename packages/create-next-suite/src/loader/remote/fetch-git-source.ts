import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, rename, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'

import { errorCodeOf } from '../../file-system/error-code.ts'
import { PluginLoadError } from '../plugin-load-error.ts'
import { fillCacheOnce } from './cache.ts'
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
/** The hook events that init, fetch and checkout fire. */
const HOOK_EVENTS = ['post-checkout', 'post-index-change', 'reference-transaction']
const NO_HOOKS = 'no-hooks'
const CLONE = 'clone'
/** What a fetch without a ref takes: the branch the repository names as its default. */
const DEFAULT_REF = 'HEAD'

/** Makes ssh fail instead of asking for a password or to accept an unknown host key. */
const SSH_BATCH_MODE = '-o BatchMode=yes'
const DEFAULT_SSH_COMMAND = 'ssh'
/** The exit code of `git config --get` for a key that is not set. */
const CONFIG_KEY_MISSING = '1'

type GitAddress = Extract<RemoteAddress, { kind: 'git' }>
type Git = (args: string[]) => Promise<{ stdout: string }>
/** Where git runs and with which environment. */
type GitPlace = { cwd: string; env: NodeJS.ProcessEnv }

const execFileAsync = promisify(execFile)

/** What `git config` prints for its arguments, or nothing for a key that is not set. */
const readGitConfig = async (args: readonly string[], place: GitPlace): Promise<string> => {
  try {
    const { stdout } = await execFileAsync('git', ['config', ...args], place)
    return stdout.trim()
  } catch (error) {
    if (errorCodeOf(error) === CONFIG_KEY_MISSING) {
      return ''
    }
    throw error
  }
}

/** The names of a configuration section's subsections, such as the drivers under `filter`. */
const configuredNames = async (section: string, place: GitPlace): Promise<string[]> => {
  const subsectionKey = new RegExp(`^${section}\\.(.+)\\.[^.]+$`)
  const keys = await readGitConfig(['--name-only', '--get-regexp', `^${section}\\.`], place)
  return keys.split('\n').flatMap((key) => subsectionKey.exec(key)?.[1] ?? [])
}

/**
 * Options that switch off what the git configuration would run in a place: script hooks through
 * an empty hooks directory, configured hooks and every filter driver, by emptying its commands
 * and making it optional. A repository picks filters through its `.gitattributes`, so its content
 * could otherwise reach programs such as git-lfs before it is trusted
 * (git-scm.com/docs/gitattributes, git-scm.com/docs/git-hook). Read inside the clone, the names
 * include those of conditional includes that apply to it.
 */
const commandsSwitchedOff = async (hooks: string, place: GitPlace): Promise<string[]> => {
  const filters = new Set([LFS_FILTER, ...(await configuredNames('filter', place))])
  const hookNames = new Set([...HOOK_EVENTS, ...(await configuredNames('hook', place))])
  return [
    '-c',
    `core.hooksPath=${hooks}`,
    ...[...hookNames].flatMap((name) => ['-c', `hook.${name}.enabled=false`]),
    ...[...filters].flatMap((driver) => [
      ...FILTER_COMMANDS.flatMap((command) => ['-c', `filter.${driver}.${command}=`]),
      '-c',
      `filter.${driver}.required=false`,
    ]),
  ]
}

/**
 * The environment git runs in: it never prompts, finds no repository around the cache, git-lfs
 * skips its smudge filter even when run, and ssh runs in batch mode on top of the user's own ssh
 * command. `GIT_SSH` names a program without arguments, so it is left as it is.
 */
const gitEnvironment = async (cacheDir: string, cwd: string): Promise<NodeJS.ProcessEnv> => {
  const env = {
    ...process.env,
    GIT_TERMINAL_PROMPT: '0',
    GIT_CEILING_DIRECTORIES: cacheDir,
    GIT_LFS_SKIP_SMUDGE: '1',
  }
  if (process.env.GIT_SSH_COMMAND === undefined && process.env.GIT_SSH !== undefined) {
    return env
  }
  const sshCommand =
    process.env.GIT_SSH_COMMAND ??
    ((await readGitConfig(['--get', 'core.sshCommand'], { cwd, env })) || DEFAULT_SSH_COMMAND)
  return { ...env, GIT_SSH_COMMAND: `${sshCommand} ${SSH_BATCH_MODE}` }
}

/**
 * Runs git with the options that switch commands off, in a directory of the cache rather than the
 * current one: Windows looks for a program in the current directory before PATH, and that may be
 * a project someone else wrote.
 */
const gitWith =
  (switchedOff: readonly string[], place: GitPlace): Git =>
  (args) =>
    execFileAsync('git', [...GIT_HARDENING, ...switchedOff, ...args], place)

/**
 * Fetches the ref of a repository, or its default branch, into a fresh repository and checks it
 * out with the commands switched off that the configuration names for that repository.
 */
const cloneInto = async (scratch: string, { url, ref }: GitAddress, place: GitPlace) => {
  const hooks = join(scratch, NO_HOOKS)
  const clone = join(scratch, CLONE)
  await mkdir(hooks)
  const git = gitWith(await commandsSwitchedOff(hooks, place), place)
  await git(['init', '--quiet', clone])
  await git(['-C', clone, 'fetch', '--quiet', '--depth', '1', '--', url, ref ?? DEFAULT_REF])
  const inClone = gitWith(await commandsSwitchedOff(hooks, { ...place, cwd: clone }), place)
  await inClone(['-C', clone, 'checkout', '--quiet', 'FETCH_HEAD'])
  const { stdout } = await inClone(['-C', clone, 'rev-parse', 'HEAD'])
  return { clone, commit: stdout.trim() }
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
    const env = await gitEnvironment(environment.cacheDir, scratch)
    const { clone, commit } = await cloneInto(scratch, address, { cwd: scratch, env })
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
