import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  assertNoUntrackedChanges,
  checkWorkflow,
  generateProject,
  readScripts,
  runProjectChecks,
} from '../src/generated-project.ts'
import { PROJECT_NAME } from '../src/project-name.ts'
import { listScenarios, type Scenario } from '../src/scenarios.ts'

const USAGE = 'usage: node scripts/matrix.ts <scenario> <package manager>'

const parseArguments = (): { scenario: Scenario; packageManager: string } => {
  const [scenarioName, packageManager] = process.argv.slice(2)
  const scenario = listScenarios().find((candidate) => candidate.name === scenarioName)
  if (scenario === undefined || packageManager === undefined) {
    throw new Error(USAGE)
  }
  return { scenario, packageManager }
}

const { scenario, packageManager } = parseArguments()
const workspace = mkdtempSync(join(tmpdir(), `next-suite-${scenario.name}-${packageManager}-`))
const project = join(workspace, PROJECT_NAME)
generateProject(workspace, [
  '--answers',
  scenario.answers,
  '--package-manager',
  packageManager,
  '--yes',
])
const scripts = readScripts(project)
runProjectChecks({ project, packageManager }, scripts)
checkWorkflow(project, packageManager, scripts)
assertNoUntrackedChanges(project)
rmSync(workspace, { recursive: true, force: true })
process.stdout.write(`\n${scenario.name} with ${packageManager}: every check passed\n`)
