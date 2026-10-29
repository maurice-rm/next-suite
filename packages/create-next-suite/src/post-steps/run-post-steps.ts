import type { CommandResult, CommandRunner } from './run-command.ts'
import { findUnsupportedVersion } from './supported-versions.ts'

const INITIAL_BRANCH = 'main'
const INITIAL_COMMIT_MESSAGE = 'chore: initial commit'
/** Used for the first commit only when git has no identity configured. */
const FALLBACK_IDENTITY = [
  '-c',
  'user.name=create-next-suite',
  '-c',
  'user.email=create-next-suite@users.noreply.github.com',
]

/** What a step says while it runs, when it succeeds and when it fails. */
type StepMessages = { start: string; done: string; failed: string }

/** Shows the steps of a run; a step answers whether it succeeded. */
export type StepReporter = {
  step: (messages: StepMessages, action: () => Promise<CommandResult>) => Promise<boolean>
  note: (message: string) => void
}

/** A plugin script that runs after the install, with what the run says about it. */
type PostStepScript = { script: string; running: string; done: string }

/** What runs after the files are written, and where. */
export type PostStepsInput = {
  directory: string
  packageManager: string | undefined
  scripts: readonly PostStepScript[]
  shouldInstall: boolean
  shouldInitializeGit: boolean
  runCommand: CommandRunner
  reporter: StepReporter
}

const NOT_INSTALLED: CommandResult = { isSuccess: false, output: 'Git is not installed.' }

const initializeGit = async ({ directory, runCommand, reporter }: PostStepsInput) => {
  const repository = await runCommand('git', ['rev-parse', '--is-inside-work-tree'], directory)
  if (repository.isSuccess) {
    reporter.note('The directory is inside a git repository already — skipping git init.')
    return false
  }
  return reporter.step(
    {
      start: 'Initializing git repository',
      done: 'Initialized git repository',
      failed: 'Could not initialize git repository',
    },
    async () => {
      const git = await runCommand('git', ['--version'], directory)
      return git.isSuccess
        ? runCommand('git', ['init', '--initial-branch', INITIAL_BRANCH], directory)
        : NOT_INSTALLED
    },
  )
}

const findInstallProblem = async (
  packageManager: string,
  { directory, runCommand }: PostStepsInput,
): Promise<string | undefined> => {
  const installCommand = `\`${packageManager} install\``
  const version = await runCommand(packageManager, ['--version'], directory)
  if (!version.isSuccess) {
    return `${packageManager} was not found on your PATH — skipping install. Install it, then run ${installCommand}.`
  }
  const hint = findUnsupportedVersion({ name: packageManager, version: version.output.trim() })
  return hint === undefined ? undefined : `${hint}, then run ${installCommand}.`
}

const install = async (packageManager: string, input: PostStepsInput) => {
  const problem = await findInstallProblem(packageManager, input)
  if (problem !== undefined) {
    input.reporter.note(problem)
    return false
  }
  return input.reporter.step(
    {
      start: `Installing dependencies (${packageManager})`,
      done: 'Installed dependencies',
      failed: `Could not install — run \`${packageManager} install\` yourself`,
    },
    () => input.runCommand(packageManager, ['install'], input.directory),
  )
}

const runScripts = async (packageManager: string, input: PostStepsInput) => {
  for (const { script, running, done } of input.scripts) {
    await input.reporter.step(
      {
        start: running,
        done,
        failed: `Could not run ${script} — run \`${packageManager} run ${script}\` yourself`,
      },
      () => input.runCommand(packageManager, ['run', script], input.directory),
    )
  }
}

/** The identity options for the first commit: none when git has one, the fallback otherwise. */
const identityOptions = async ({ directory, runCommand }: PostStepsInput) => {
  const email = await runCommand('git', ['config', 'user.email'], directory)
  return email.isSuccess && email.output.trim() !== '' ? [] : FALLBACK_IDENTITY
}

const commit = async (input: PostStepsInput) => {
  const { directory, runCommand, reporter } = input
  return reporter.step(
    {
      start: 'Creating initial commit',
      done: 'Created initial commit',
      failed: 'Could not create initial commit',
    },
    async () => {
      const added = await runCommand('git', ['add', '--all'], directory)
      if (!added.isSuccess) {
        return added
      }
      const identity = await identityOptions(input)
      return runCommand(
        'git',
        [...identity, 'commit', '--no-verify', '--message', INITIAL_COMMIT_MESSAGE],
        directory,
      )
    },
  )
}

/**
 * Runs the steps after the files are written, each on a best-effort basis: initialize git on
 * `main`, install the dependencies, run the post-step scripts of the plugins, then commit. A step
 * that fails is reported with the command to run instead; the steps that depend on it are
 * skipped, the project stays.
 */
export const runPostSteps = async (input: PostStepsInput): Promise<{ isInstalled: boolean }> => {
  const { packageManager } = input
  const isGitInitialized = input.shouldInitializeGit && (await initializeGit(input))
  const isInstalled =
    input.shouldInstall && packageManager !== undefined && (await install(packageManager, input))
  if (isInstalled) {
    await runScripts(packageManager, input)
  }
  if (isGitInitialized) {
    await commit(input)
  }
  return { isInstalled }
}
