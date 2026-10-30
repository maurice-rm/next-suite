import { PROJECT_NAME } from './project-name.ts'
import { runCli } from './run-cli.ts'
import type { Scenario } from './scenarios.ts'

type DryRun = {
  scenario: Scenario
  packageManager: string
  cwd: string
}

/** Runs a scenario as a dry run with its diff, the way its snapshot records it. */
export const dryRunScenario = ({ scenario, packageManager, cwd }: DryRun) =>
  runCli(
    'create-next-suite',
    [
      PROJECT_NAME,
      '--answers',
      scenario.answers,
      '--package-manager',
      packageManager,
      '--yes',
      '--dry-run',
      '--diff',
    ],
    { cwd },
  )
