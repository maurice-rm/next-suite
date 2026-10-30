import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { parse } from 'yaml'

import { PROJECT_NAME } from '../src/project-name.ts'
import { binPathOf } from '../src/run-cli.ts'
import { listScenarios, type Scenario } from '../src/scenarios.ts'

type Scripts = Record<string, string>

/** The checks a generated project passes, as package.json scripts; each runs when it exists. */
const PROJECT_CHECKS = ['typecheck', 'lint', 'format:check', 'knip', 'test', 'build']
const REQUIRED_STEPS = [
  'Installed dependencies',
  'Created initial commit',
  `${PROJECT_NAME} is ready`,
]
const WORKFLOW = '.github/workflows/ci.yml'
const USAGE = 'usage: node scripts/matrix.ts <scenario> <package manager>'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const run = (command: string, args: string[], cwd: string): string =>
  execFileSync(command, args, { cwd, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } })

const parseArguments = (): { scenario: Scenario; packageManager: string } => {
  const [scenarioName, packageManager] = process.argv.slice(2)
  const scenario = listScenarios().find((candidate) => candidate.name === scenarioName)
  if (scenario === undefined || packageManager === undefined) {
    throw new Error(USAGE)
  }
  return { scenario, packageManager }
}

const generateProject = (workspace: string, scenario: Scenario, packageManager: string): void => {
  const output = run(
    process.execPath,
    [
      binPathOf('create-next-suite'),
      PROJECT_NAME,
      '--answers',
      scenario.answers,
      '--package-manager',
      packageManager,
      '--yes',
    ],
    workspace,
  )
  process.stdout.write(output)
  const missingSteps = REQUIRED_STEPS.filter((step) => !output.includes(step))
  if (missingSteps.length > 0) {
    throw new Error(`the run did not finish every step: ${missingSteps.join(', ')}`)
  }
}

const readScripts = (project: string): Scripts => {
  const packageJson: unknown = JSON.parse(readFileSync(join(project, 'package.json'), 'utf8'))
  if (!isRecord(packageJson) || !isRecord(packageJson.scripts)) {
    throw new Error('the package.json of the generated project has no scripts')
  }
  const { scripts } = packageJson
  if (!Object.values(scripts).every((script) => typeof script === 'string')) {
    throw new Error('the package.json of the generated project has a script that is not a string')
  }
  return scripts as Scripts
}

const runProjectChecks = (project: string, packageManager: string, scripts: Scripts): void => {
  for (const check of PROJECT_CHECKS.filter((name) => Object.hasOwn(scripts, name))) {
    process.stdout.write(`\n$ ${packageManager} run ${check}\n`)
    execFileSync(packageManager, ['run', check], { cwd: project, stdio: 'inherit' })
  }
}

const readWorkflowCommands = (path: string): string[] => {
  const workflow: unknown = parse(readFileSync(path, 'utf8'))
  if (!isRecord(workflow) || !isRecord(workflow.jobs)) {
    throw new Error(`${WORKFLOW} has no jobs`)
  }
  return Object.values(workflow.jobs).flatMap((job) => {
    if (!isRecord(job) || !Array.isArray(job.steps)) {
      throw new Error(`${WORKFLOW} has a job without steps`)
    }
    return job.steps.flatMap((step: unknown) =>
      isRecord(step) && typeof step.run === 'string' ? [step.run] : [],
    )
  })
}

/** Fails when the CI workflow runs a script the project does not have. */
const checkWorkflow = (project: string, packageManager: string, scripts: Scripts): void => {
  const path = join(project, WORKFLOW)
  if (!existsSync(path)) {
    return
  }
  const scriptRun = new RegExp(`^${packageManager} run (\\S+)$`)
  const missingScripts = readWorkflowCommands(path)
    .map((command) => scriptRun.exec(command)?.[1])
    .filter((script) => script !== undefined && !Object.hasOwn(scripts, script))
  if (missingScripts.length > 0) {
    throw new Error(
      `${WORKFLOW} runs scripts the project does not have: ${missingScripts.join(', ')}`,
    )
  }
}

const assertNoUntrackedChanges = (project: string): void => {
  const changes = run('git', ['status', '--porcelain'], project)
  if (changes !== '') {
    throw new Error(`the checks left files git does not ignore:\n${changes}`)
  }
}

const { scenario, packageManager } = parseArguments()
const workspace = mkdtempSync(join(tmpdir(), `next-suite-${scenario.name}-${packageManager}-`))
const project = join(workspace, PROJECT_NAME)
generateProject(workspace, scenario, packageManager)
const scripts = readScripts(project)
runProjectChecks(project, packageManager, scripts)
checkWorkflow(project, packageManager, scripts)
assertNoUntrackedChanges(project)
rmSync(workspace, { recursive: true, force: true })
process.stdout.write(`\n${scenario.name} with ${packageManager}: every check passed\n`)
