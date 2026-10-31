import { findProjectRoot } from '../project-config/find-project-root.ts'
import { PROJECT_PATHS } from '../project-config/project-paths.ts'
import { changesFiles, describeUpdate } from './describe-update.ts'
import type { NextSuiteEnvironment, Report } from './next-suite-environment.ts'
import { UpdateMergeConflictError } from './update-merge-conflict-error.ts'
import { type UpdateOptions, type UpdateOutcome, updateProject } from './update-project.ts'

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
export const runUpdate = async (
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
