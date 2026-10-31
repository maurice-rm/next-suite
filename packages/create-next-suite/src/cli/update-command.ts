import type { Command } from 'commander'

import { findProjectRoot } from '../project-config/find-project-root.ts'
import { PROJECT_PATHS } from '../project-config/project-paths.ts'
import type { NextSuiteEnvironment, Report } from './next-suite-environment.ts'
import { runUpdate } from './run-update.ts'
import { continueUpdate } from './update-project.ts'

type UpdateFlags = { dryRun?: boolean; force?: boolean; continue?: boolean }

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
