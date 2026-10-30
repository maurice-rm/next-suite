import { PROJECT_NAME } from './project-name.ts'
import { runCli } from './run-cli.ts'
import type { Scenario } from './scenarios.ts'

const CREATED_AT = /"createdAt": "[^"]+"/

type DryRun = {
  scenario: Scenario
  packageManager: string
  cwd: string
  /** `NEXT_SUITE_ENGINE`; the default engine without one. */
  engine?: string
}

/**
 * Runs a scenario as a dry run with its diff, the way its snapshot records it: the time of
 * creation in next-suite.json is replaced by `<now>`.
 */
export const dryRunScenario = async ({ scenario, packageManager, cwd, engine }: DryRun) => {
  const result = await runCli(
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
    { cwd, environment: engine === undefined ? {} : { NEXT_SUITE_ENGINE: engine } },
  )
  return { ...result, stdout: result.stdout.replace(CREATED_AT, '"createdAt": "<now>"') }
}
