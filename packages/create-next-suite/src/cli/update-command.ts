import type { Command } from 'commander'

import { ExpectedError } from '../expected-error.ts'
import { findProjectRoot } from '../project-config/find-project-root.ts'
import { PROJECT_PATHS } from '../project-config/project-paths.ts'
import { changesFiles, describeUpdate } from './describe-update.ts'
import type { NextSuiteEnvironment, Report } from './next-suite-environment.ts'
import {
  continueUpdate,
  type UpdateOptions,
  type UpdateOutcome,
  updateProject,
} from './update-project.ts'

type UpdateFlags = { dryRun?: boolean; force?: boolean; continue?: boolean }

/** How the end of an update reads, by its state. */
const closingOf = (outcome: UpdateOutcome): string => {
  if (outcome.state === 'dry-run') {
    return changesFiles(outcome.report)
      ? 'Dry run, nothing was written.'
      : 'Dry run: nothing to update.'
  }
  return changesFiles(outcome.report)
    ? `Updated the project and ${PROJECT_PATHS.lock}.`
    : `No file to update; ${PROJECT_PATHS.lock} is current.`
}

/** An update that left merge conflicts; the run fails once its report is out. */
class UpdateMergeConflictError extends ExpectedError {
  override name = 'UpdateMergeConflictError'
}

/** The environment of an update: the next-suite environment and the terminal for trust. */
const updateEnvironmentOf = (environment: NextSuiteEnvironment) => ({
  ...environment,
  streams: environment.isInteractive
    ? { input: environment.input, output: environment.output }
    : undefined,
})

/**
 * Runs an update and reports it. Conflicts fail the run once the report is out, so a script sees
 * that the update is not complete.
 *
 * @throws UpdateMergeConflictError when files have merge conflicts.
 */
const runUpdate = async (
  environment: NextSuiteEnvironment,
  report: Report,
  options: UpdateOptions,
): Promise<void> => {
  const root = findProjectRoot(environment.cwd)
  const outcome = await updateProject(updateEnvironmentOf(environment), {
    root,
    options,
  })
  const lines = describeUpdate(outcome.report, outcome)
  if (outcome.state !== 'pending') {
    report([...lines, closingOf(outcome)].join('\n'))
    return
  }
  report(lines.join('\n'))
  const count = outcome.report.mergeConflicts.length
  throw new UpdateMergeConflictError(
    `${count === 1 ? '1 file has merge conflicts' : `${count} files have merge conflicts`}; resolve them, then run \`next-suite update --continue\` to record the update`,
  )
}

const runContinue = async (environment: NextSuiteEnvironment, report: Report): Promise<void> => {
  const root = findProjectRoot(environment.cwd)
  const notes = await continueUpdate(environment, root)
  report(
    [
      ...notes.map((note) => `Note: ${note}.`),
      `Recorded the update in ${PROJECT_PATHS.lock}.`,
    ].join('\n'),
  )
}

export const addUpdateCommand = (
  program: Command,
  environment: NextSuiteEnvironment,
  report: Report,
): void => {
  program
    .command('update')
    .description('update the project to next-suite.config.ts and keep your changes to its files')
    .option('--dry-run', 'show what the update would do, without writing')
    .option('--force', 'update over uncommitted changes, saved in a stash commit first')
    .option('--continue', 'record an update once you resolved its merge conflicts')
    .action(async ({ dryRun, force, continue: shouldContinue }: UpdateFlags) => {
      if (shouldContinue === true) {
        await runContinue(environment, report)
        return
      }
      await runUpdate(environment, report, {
        dryRun: dryRun === true,
        force: force === true,
      })
    })
}
