import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { parse } from 'yaml'

import { PROJECT_NAME } from './project-name.ts'
import { binPathOf } from './run-cli.ts'

/** The scripts of a generated project's package.json by name. */
export type Scripts = Record<string, string>

/** The checks a generated project passes, as package.json scripts; each runs when it exists. */
const PROJECT_CHECKS = ['typecheck', 'lint', 'format:check', 'knip', 'test', 'build']
const REQUIRED_STEPS = [
  'Installed dependencies',
  'Created initial commit',
  `${PROJECT_NAME} is ready`,
]
const WORKFLOW = '.github/workflows/ci.yml'
const PACKAGE_ROOT = dirname(fileURLToPath(import.meta.resolve('create-next-suite/package.json')))
/** What a generated project's devDependency on create-next-suite names instead of its version. */
const CLI_SPECIFIER_VARIABLE = 'NEXT_SUITE_CLI_SPECIFIER'
const TARBALL_EXTENSION = '.tgz'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

type RunOptions = { cwd: string; env?: Record<string, string> }

export const run = (command: string, args: string[], { cwd, env = {} }: RunOptions): string =>
  execFileSync(command, args, {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, NO_COLOR: '1', ...env },
  })

/**
 * Packs the built create-next-suite into the workspace, so the generated project installs the
 * build under test as its devDependency rather than a published version.
 */
const packCreateNextSuite = (workspace: string): string => {
  run('pnpm', ['pack', '--pack-destination', workspace], { cwd: PACKAGE_ROOT })
  const tarball = readdirSync(workspace).find((file) => file.endsWith(TARBALL_EXTENSION))
  if (tarball === undefined) {
    throw new Error(`pnpm pack wrote no tarball into ${workspace}`)
  }
  return join(workspace, tarball)
}

/**
 * Creates the project `my-app` in the workspace with the built create-next-suite and the given
 * arguments, installed and committed; fails unless the run finished every step.
 */
export const generateProject = (workspace: string, args: readonly string[]): void => {
  const tarball = packCreateNextSuite(workspace)
  const output = run(process.execPath, [binPathOf('create-next-suite'), PROJECT_NAME, ...args], {
    cwd: workspace,
    env: { [CLI_SPECIFIER_VARIABLE]: `file:${tarball}` },
  })
  process.stdout.write(output)
  const missingSteps = REQUIRED_STEPS.filter((step) => !output.includes(step))
  if (missingSteps.length > 0) {
    throw new Error(`the run did not finish every step: ${missingSteps.join(', ')}`)
  }
}

export const readScripts = (project: string): Scripts => {
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

/** Runs a script of the project with its output shown, failing when it fails. */
export const runScript = (
  { project, packageManager }: { project: string; packageManager: string },
  script: string,
  env: Record<string, string> = {},
): void => {
  process.stdout.write(`\n$ ${packageManager} run ${script}\n`)
  execFileSync(packageManager, ['run', script], {
    cwd: project,
    stdio: 'inherit',
    env: { ...process.env, ...env },
  })
}

/** Runs the project's own checks that it has scripts for, in a fixed order. */
export const runProjectChecks = (
  target: { project: string; packageManager: string },
  scripts: Scripts,
  env: Record<string, string> = {},
): void => {
  for (const check of PROJECT_CHECKS.filter((name) => Object.hasOwn(scripts, name))) {
    runScript(target, check, env)
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
export const checkWorkflow = (project: string, packageManager: string, scripts: Scripts): void => {
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

export const assertNoUntrackedChanges = (project: string): void => {
  const changes = run('git', ['status', '--porcelain'], { cwd: project })
  if (changes !== '') {
    throw new Error(`the checks left files git does not ignore:\n${changes}`)
  }
}
