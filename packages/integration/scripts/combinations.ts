import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { argumentsOf, COMBINATIONS, type Combination } from '../src/combinations.ts'
import {
  assertNoUntrackedChanges,
  generateProject,
  readScripts,
  run,
  runProjectChecks,
  runScript,
} from '../src/generated-project.ts'
import { PROJECT_NAME } from '../src/project-name.ts'

const USAGE = `usage: node scripts/combinations.ts <${COMBINATIONS.map(({ name }) => name).join(' | ')}>`
const PACKAGE_MANAGER = 'pnpm'
const ENV_EXAMPLE = '.env.example'
const ENV_LINE = /^([A-Z][A-Z0-9_]*)=(.*)$/
/** Checks the tables against what the installed Better Auth writes, without a database. */
const AUTH_CHECK = 'auth:check'
/** Applies the schema to the SQLite file, which needs no server. */
const SCHEMA_PUSH = 'db:push'

const parseArguments = (): Combination => {
  const [name] = process.argv.slice(2)
  const found = COMBINATIONS.find((candidate) => candidate.name === name)
  if (found === undefined) {
    throw new Error(USAGE)
  }
  return found
}

/**
 * The example values of `.env.example`, which the checks run with: t3-env refuses a missing
 * variable the moment a module reads one, `next build` included.
 */
const readExampleEnv = (project: string): Record<string, string> =>
  Object.fromEntries(
    readFileSync(join(project, ENV_EXAMPLE), 'utf8')
      .split('\n')
      .flatMap((line) => {
        const match = ENV_LINE.exec(line)
        return match?.[1] === undefined || match[2] === undefined ? [] : [[match[1], match[2]]]
      }),
  )

/** Checks the Compose file and the Dockerfile with Docker, without building the image. */
const checkContainer = (project: string): void => {
  process.stdout.write('\n$ docker compose config --quiet\n')
  run('docker', ['compose', 'config', '--quiet'], { cwd: project })
  process.stdout.write('\n$ docker build --check .\n')
  process.stdout.write(run('docker', ['build', '--check', '.'], { cwd: project }))
}

const combination = parseArguments()
const workspace = mkdtempSync(join(tmpdir(), `next-suite-${combination.name}-`))
const project = join(workspace, PROJECT_NAME)
const target = { project, packageManager: PACKAGE_MANAGER }
generateProject(workspace, [...argumentsOf(combination), '--package-manager', PACKAGE_MANAGER])
const scripts = readScripts(project)
const env = readExampleEnv(project)
runProjectChecks(target, scripts, env)
if (combination.plugins.includes('better-auth')) {
  runScript(target, AUTH_CHECK, env)
}
if (combination.plugins.includes('sqlite')) {
  runScript(target, SCHEMA_PUSH, env)
}
if (combination.plugins.includes('docker')) {
  checkContainer(project)
}
assertNoUntrackedChanges(project)
rmSync(workspace, { recursive: true, force: true })
process.stdout.write(`\n${combination.name}: every check passed\n`)
