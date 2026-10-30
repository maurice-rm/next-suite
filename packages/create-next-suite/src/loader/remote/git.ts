import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, rename, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'

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

const execFileAsync = promisify(execFile)

const git = (args: string[]) =>
  execFileAsync('git', [...GIT_HARDENING, ...args], {
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  })

/** Clones the ref of a repository into a directory: a branch or tag directly, a commit by fetching it. */
const cloneInto = async (url: string, ref: string | undefined, directory: string) => {
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
  { url, ref }: Extract<RemoteAddress, { kind: 'git' }>,
): Promise<FetchedSource> => {
  await mkdir(environment.cacheDir, { recursive: true })
  const scratch = await mkdtemp(join(environment.cacheDir, '.clone-'))
  try {
    const clone = join(scratch, 'clone')
    await cloneInto(url, ref, clone)
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
