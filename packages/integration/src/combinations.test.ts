import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { argumentsOf, COMBINATIONS, type Combination, testPluginPath } from './combinations.ts'
import { PROJECT_NAME } from './project-name.ts'
import { runCli } from './run-cli.ts'

let cwd: string

const dryRun = (args: readonly string[]) =>
  runCli('create-next-suite', [PROJECT_NAME, '--dry-run', '--diff', ...args], { cwd })

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
