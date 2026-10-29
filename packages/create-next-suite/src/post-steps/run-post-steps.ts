import type { CommandResult, CommandRunner } from './run-command.ts'
import { findUnsupportedVersion } from './supported-versions.ts'

const INITIAL_COMMIT_MESSAGE = 'Initial commit from create-next-suite'

/** What a step says while it runs, when it succeeds and when it fails. */
type StepMessages = { start: string; done: string; failed: string }

/** Shows the steps of a run; a step answers whether it succeeded. */
export type StepReporter = {
  step: (messages: StepMessages, action: () => Promise<CommandResult>) => Promise<boolean>
  note: (message: string) => void
}

/** What runs after the files are written, and where. */
export type PostStepsInput = {
  directory: string
  packageManager: string | undefined
  scripts: readonly string[]
  shouldInstall: boolean
  shouldInitializeGit: boolean
  runCommand: CommandRunner
  reporter: StepReporter
}

const initializeGit = async ({ directory, runCommand, reporter }: PostStepsInput) => {
  const repository = await runCommand('git', ['rev-parse', '--is-inside-work-tree'], directory)
  if (repository.isSuccess) {
    reporter.note('The directory is inside a git repository already; skipped git init')
    return false
  }
  return reporter.step(
    {
      start: 'Initializing a git repository',
      done: 'Initialized a git repository',
      failed: 'Could not initialize a git repository',
    },
    () => runCommand('git', ['init'], directory),
  )
}

const findInstallProblem = async (
  packageManager: string,
  { directory, runCommand }: PostStepsInput,
): Promise<string | undefined> => {
  const installCommand = `\`${packageManager} install\``
  const version = await runCommand(packageManager, ['--version'], directory)
  if (!version.isSuccess) {
    return `${packageManager} did not start; install it, then run ${installCommand}`
  }
  const hint = findUnsupportedVersion({ name: packageManager, version: version.output.trim() })
  return hint === undefined ? undefined : `${hint}, then run ${installCommand}`
}

const install = async (packageManager: string, input: PostStepsInput) => {
  const problem = await findInstallProblem(packageManager, input)
  if (problem !== undefined) {
    input.reporter.note(problem)
    return false
  }
  return input.reporter.step(
    {
      start: `Installing dependencies with ${packageManager}`,
      done: 'Installed dependencies',
      failed: `Could not install dependencies; run \`${packageManager} install\` yourself`,
    },
    () => input.runCommand(packageManager, ['install'], input.directory),
  )
}

const runScripts = async (packageManager: string, input: PostStepsInput) => {
  for (const script of input.scripts) {
    await input.reporter.step(
      {
        start: `Running ${script}`,
        done: `Ran ${script}`,
        failed: `Could not run ${script}; run \`${packageManager} run ${script}\` yourself`,
      },
      () => input.runCommand(packageManager, ['run', script], input.directory),
    )
  }
}

const commit = async ({ directory, runCommand, reporter }: PostStepsInput) =>
  reporter.step(
    {
      start: 'Creating the first commit',
      done: 'Created the first commit',
      failed: 'Could not create the first commit',
    },
    async () => {
      const added = await runCommand('git', ['add', '--all'], directory)
      return added.isSuccess
        ? runCommand('git', ['commit', '--message', INITIAL_COMMIT_MESSAGE], directory)
        : added
    },
  )

/**
 * Runs the steps after the files are written, each on a best-effort basis: initialize git,
 * install the dependencies, run the post-step scripts of the plugins, then commit. A step that
 * fails is reported with the command to run instead; the steps that depend on it are skipped,
 * the project stays.
 */
export const runPostSteps = async (input: PostStepsInput): Promise<void> => {
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
}
