import { execFile } from 'node:child_process'
import { resolve } from 'node:path'
import { promisify } from 'node:util'

import { findUnsafePathProblem } from '../file-system/find-unsafe-path-problem.ts'
import { ProjectConfigError } from './project-config-error.ts'

/** The part of a `git status --porcelain` entry before the path: two status letters and a space. */
const STATUS_WIDTH = 3
/** The mode git records for a regular file, executable or not. */
const FILE_MODES: ReadonlySet<string> = new Set(['100644', '100755'])
/** The largest output a git command may print, far above the files of a project's inputs. */
const MAX_OUTPUT_BYTES = 64 * 1024 * 1024
/** How the stash names the changes an update over uncommitted changes saved. */
const STASH_MESSAGE = 'next-suite update --force'
const NUL = '\0'
const TAB = '\t'

const execFileAsync = promisify(execFile)

const git = async (directory: string, args: readonly string[]): Promise<string> => {
  const { stdout } = await execFileAsync('git', args, {
    cwd: directory,
    encoding: 'utf8',
    maxBuffer: MAX_OUTPUT_BYTES,
  })
  return stdout
}

/** The path of a project directory inside its repository, such as `apps/web/`. */
const prefixOf = async (directory: string): Promise<string> => {
  try {
    return (await git(directory, ['rev-parse', '--show-prefix'])).trim()
  } catch (error) {
    throw new ProjectConfigError(
      `${directory} is not in a Git repository; next-suite update needs Git to know what you changed, so run \`git init\` and commit the project first`,
      { cause: error },
    )
  }
}

/**
 * The path of a file of next-suite's own in the Git directory of a project, one per project of
 * the repository, such as `.git/next-suite-pending-update-apps%2Fweb%2F.json`.
 *
 * @throws ProjectConfigError outside a Git repository.
 */
export const gitPathOf = async (directory: string, name: string): Promise<string> => {
  const prefix = await prefixOf(directory)
  const file = prefix === '' ? `${name}.json` : `${name}-${encodeURIComponent(prefix)}.json`
  return resolve(directory, (await git(directory, ['rev-parse', '--git-path', file])).trim())
}

/**
 * Fails unless a directory lies in a Git repository.
 *
 * @throws ProjectConfigError outside a Git repository.
 */
export const assertInRepository = async (directory: string): Promise<void> => {
  await prefixOf(directory)
}

/**
 * Every changed, staged or untracked file below a project directory, by its path relative to it.
 *
 * @throws ProjectConfigError outside a Git repository.
 */
export const findUncommittedPaths = async (directory: string): Promise<string[]> => {
  const prefix = await prefixOf(directory)
  const entries = (
    await git(directory, ['status', '--porcelain=v1', '-z', '--untracked-files=all', '--', '.'])
  )
    .split(NUL)
    .filter((entry) => entry !== '')
  const paths: string[] = []
  for (let index = 0; index < entries.length; index++) {
    const entry = entries[index] ?? ''
    paths.push(entry.slice(STATUS_WIDTH + prefix.length))
    // A rename or copy is followed by the path it came from.
    if (entry.startsWith('R') || entry.startsWith('C')) {
      index++
    }
  }
  return paths
}

/** The exit code of `git rev-parse --verify --quiet` for a name that resolves to nothing. */
const NOT_FOUND_STATUS = 1

/** Whether the repository has a commit yet; right after `git init` it has none. */
const hasCommits = async (directory: string): Promise<boolean> => {
  try {
    await git(directory, ['rev-parse', '--verify', '--quiet', 'HEAD'])
    return true
  } catch (error) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === NOT_FOUND_STATUS
    ) {
      return false
    }
    throw error
  }
}

/** The last commit that changed a path of the project, or nothing when no commit has it. */
export const lastCommitOf = async (
  directory: string,
  path: string,
): Promise<string | undefined> => {
  if (!(await hasCommits(directory))) {
    return undefined
  }
  const commit = (await git(directory, ['log', '-1', '--format=%H', '--', path])).trim()
  return commit === '' ? undefined : commit
}

/**
 * The files of a commit below paths of the project, by their path relative to it; a path the
 * commit does not have adds nothing.
 *
 * @throws ProjectConfigError for an entry that is no regular file, such as a link, or whose path
 * could leave the directory it is written to.
 */
export const readCommittedFiles = async (
  directory: string,
  { commit, paths }: { commit: string; paths: readonly string[] },
): Promise<Map<string, string>> => {
  const listing = await git(directory, ['ls-tree', '-r', '-z', commit, '--', ...paths])
  const files = new Map<string, string>()
  for (const entry of listing.split(NUL).filter((line) => line !== '')) {
    const [meta = '', path = ''] = entry.split(TAB)
    const [mode = '', , object = ''] = meta.split(' ')
    if (!FILE_MODES.has(mode)) {
      throw new ProjectConfigError(`${path} in commit ${commit} is no regular file`)
    }
    const problem = findUnsafePathProblem(path)
    if (problem !== undefined) {
      throw new ProjectConfigError(`${path} in commit ${commit} ${problem}`)
    }
    files.set(path, await git(directory, ['cat-file', 'blob', object]))
  }
  return files
}

/**
 * Records the uncommitted changes to tracked files in the stash, leaving the working tree as it
 * is, and answers the stash commit; nothing when there is nothing to record.
 * `git stash apply <commit>` brings the changes back.
 */
export const saveUncommittedChanges = async (directory: string): Promise<string | undefined> => {
  const commit = (await git(directory, ['stash', 'create'])).trim()
  if (commit === '') {
    return undefined
  }
  await git(directory, ['stash', 'store', '--message', STASH_MESSAGE, commit])
  return commit
}
