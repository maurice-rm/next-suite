import { execFileSync } from 'node:child_process'

/** An identity for commits, so tests do not depend on the git configuration of the machine. */
const IDENTITY = ['-c', 'user.name=next-suite test', '-c', 'user.email=test@example.com']

/** Runs git in a directory and answers what it printed. */
export const git = (directory: string, args: readonly string[]): string =>
  execFileSync('git', [...IDENTITY, ...args], {
    cwd: directory,
    encoding: 'utf8',
  })

/** Starts a repository on `main` in a directory. */
export const initRepository = (directory: string): void => {
  git(directory, ['init', '--quiet', '--initial-branch', 'main'])
}

/** Commits every change below a directory, untracked files included. */
export const commitAll = (directory: string, message: string): void => {
  git(directory, ['add', '--all', '.'])
  git(directory, ['commit', '--quiet', '--allow-empty', '--message', message])
}
