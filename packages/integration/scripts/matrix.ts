import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { parse } from 'yaml'

import { binPathOf } from '../src/run-cli.ts'
import { listScenarios } from '../src/scenarios.ts'

/** The checks a generated project passes, as package.json scripts; each runs when it exists. */
const PROJECT_CHECKS = ['typecheck', 'lint', 'format:check', 'knip', 'test', 'build']
const PROJECT_NAME = 'my-app'
const REQUIRED_STEPS = [
  'Installed dependencies',
  'Created initial commit',
  `${PROJECT_NAME} is ready`,
]

const [scenarioName, packageManager] = process.argv.slice(2)
const scenario = listScenarios().find((candidate) => candidate.name === scenarioName)
if (scenario === undefined || packageManager === undefined) {
  throw new Error('usage: node scripts/matrix.ts <scenario> <package manager>')
}

const run = (command: string, args: string[], cwd: string): string =>
  execFileSync(command, args, { cwd, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } })

const workspace = mkdtempSync(join(tmpdir(), `next-suite-${scenario.name}-${packageManager}-`))
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
const missing = REQUIRED_STEPS.filter((step) => !output.includes(step))
if (missing.length > 0) {
  throw new Error(`the run did not finish every step: ${missing.join(', ')}`)
}

const project = join(workspace, PROJECT_NAME)
const { scripts } = JSON.parse(readFileSync(join(project, 'package.json'), 'utf8')) as {
  scripts: Record<string, string>
}
for (const check of PROJECT_CHECKS.filter((name) => Object.hasOwn(scripts, name))) {
  process.stdout.write(`\n$ ${packageManager} run ${check}\n`)
  execFileSync(packageManager, ['run', check], { cwd: project, stdio: 'inherit' })
}
const WORKFLOW = '.github/workflows/ci.yml'
const SCRIPT_RUN = new RegExp(`^${packageManager} run (\\S+)$`)

/** Fails when the CI workflow is no valid YAML or runs a script the project does not have. */
const checkWorkflow = (): void => {
  const path = join(project, WORKFLOW)
  if (!existsSync(path)) {
    return
  }
  const workflow = parse(readFileSync(path, 'utf8')) as {
    jobs: Record<string, { steps: { run?: string }[] }>
  }
  const runs = Object.values(workflow.jobs).flatMap((job) => job.steps.map((step) => step.run))
  const missing = runs
    .map((command) => SCRIPT_RUN.exec(command ?? '')?.[1])
    .filter((script) => script !== undefined && !Object.hasOwn(scripts, script))
  if (missing.length > 0) {
    throw new Error(`${WORKFLOW} runs scripts the project does not have: ${missing.join(', ')}`)
  }
}
checkWorkflow()

const changes = run('git', ['status', '--porcelain'], project)
if (changes !== '') {
  throw new Error(`the checks left files git does not ignore:\n${changes}`)
}
rmSync(workspace, { recursive: true, force: true })
process.stdout.write(`\n${scenario.name} with ${packageManager}: every check passed\n`)
