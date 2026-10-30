import type { Command } from 'commander'

import { ejectProject } from '../project-config/eject-project.ts'
import { findProjectRoot } from '../project-config/find-project-root.ts'
import type { NextSuiteEnvironment, Report } from './next-suite-environment.ts'

const eject = async ({ cwd }: NextSuiteEnvironment, force: boolean): Promise<string> => {
  const root = findProjectRoot(cwd)
  const { removed, notes } = await ejectProject(root, { force })
  return [
    `Removed ${removed.join(', ')}.`,
    ...notes.map((note) => `Note: ${note}.`),
    'Run your package manager’s install to update the lockfile; the project is a plain Next.js project now.',
  ].join('\n')
}

export const addEjectCommand = (
  program: Command,
  environment: NextSuiteEnvironment,
  report: Report,
): void => {
  program
    .command('eject')
    .description(
      'stop using next-suite: remove its config, lock and devDependency from the project',
    )
    .option('--force', 'delete the plugins and overrides under next-suite/ too')
    .action(async ({ force }: { force?: boolean }) =>
      report(await eject(environment, force === true)),
    )
}
