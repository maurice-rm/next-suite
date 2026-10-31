import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { argumentsOf, COMBINATIONS, type Combination, testPluginPath } from './combinations.ts'
import { PROJECT_NAME } from './project-name.ts'
import { runCli } from './run-cli.ts'

const FILE_SEPARATOR = '\n====='

let cwd: string

const dryRun = (args: readonly string[]) =>
  runCli('create-next-suite', [PROJECT_NAME, '--dry-run', '--diff', ...args], { cwd })

/** The diff of one file in the output of `--dry-run --diff`, up to the next file's separator. */
const fileDiff = (stdout: string, path: string): string => {
  const start = stdout.indexOf(`+++ ${path}\n`)
  const end = stdout.indexOf(FILE_SEPARATOR, start)
  return start === -1 ? '' : stdout.slice(start, end === -1 ? undefined : end)
}

const combination = (name: string): Combination => {
  const found = COMBINATIONS.find((candidate) => candidate.name === name)
  if (found === undefined) {
    throw new Error(`no combination ${name}`)
  }
  return found
}

beforeAll(async () => {
  cwd = await mkdtemp(join(tmpdir(), 'next-suite-combinations-'))
})

afterAll(async () => {
  await rm(cwd, { recursive: true, force: true })
})

describe.each(COMBINATIONS)('the combination $name', (tested) => {
  it('generates', async () => {
    const result = await dryRun(argumentsOf(tested))

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
  })
})

describe('the test plugins', () => {
  it('give Drizzle the tables of Better Auth and the blog as schema modules', async () => {
    const { stdout } = await dryRun(argumentsOf(combination('drizzle-postgres')))

    expect(stdout).toContain('  db/schema/auth.ts (')
    expect(stdout).toContain('  db/schema/blog.ts (')
    expect(stdout).toContain('+export * from "./auth";\n+export * from "./blog";\n')
    expect(stdout).toContain('+  database: drizzleAdapter(db, { provider: "pg" }),\n')
  })

  it('give Prisma the models of Better Auth and the blog', async () => {
    const { stdout } = await dryRun(argumentsOf(combination('prisma-sqlite')))

    expect(stdout).toContain('+model User {\n')
    expect(stdout).toContain('+model Post {\n')
    expect(stdout).toContain('+  database: prismaAdapter(prisma, { provider: "sqlite" }),\n')
  })

  it('read the database URL through t3-env when it is selected', async () => {
    const { stdout } = await dryRun(argumentsOf(combination('drizzle-sqlite')))

    expect(stdout).toContain('+import { env } from "~/env";\n+\n+const url = env.DATABASE_URL;\n')
  })

  it('put the database service and the health check of the ORM into the container', async () => {
    const { stdout } = await dryRun(argumentsOf(combination('container-health')))

    expect(stdout).toContain('+    image: "postgres:18-alpine"\n')
    expect(stdout).toContain('+  ["database", checkDatabase],\n')
  })

  it('give Knip the client of Better Auth as an entry, under the source directory too', async () => {
    const atRoot = await dryRun(argumentsOf(combination('prisma-sqlite')))
    const inSource = await dryRun(argumentsOf(combination('drizzle-sqlite')))

    expect(atRoot.stdout).toContain('  lib/auth-client.ts (')
    expect(atRoot.stdout).toContain('+    "lib/auth-client.ts",\n')
    expect(inSource.stdout).toContain('+    "src/lib/auth-client.ts",\n')
  })

  it('tell coding agents in AGENTS.md how to run the container', async () => {
    const { stdout } = await dryRun(argumentsOf(combination('container-health')))

    expect(fileDiff(stdout, 'AGENTS.md')).toContain(
      '+## Docker\n+\n+`docker compose up --build` builds the image and starts the app with its services.\n',
    )
  })

  it('refuse Better Auth without an ORM, and two ORMs', async () => {
    const withoutOrm = await dryRun([
      '--plugin',
      testPluginPath('better-auth'),
      '--better-auth',
      '--yes',
    ])
    const twoOrms = await dryRun(
      (['sqlite', 'drizzle', 'prisma'] as const)
        .flatMap((plugin) => ['--plugin', testPluginPath(plugin), `--${plugin}`])
        .concat('--yes'),
    )

    expect(withoutOrm.stderr).toBe(
      'create-next-suite: better-auth uses the point "orm", which no selected plugin provides\n',
    )
    expect(twoOrms.stderr).toBe(
      'create-next-suite: Both drizzle and prisma provide the point "orm"\n',
    )
  })
})
