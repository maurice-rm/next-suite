import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { PROJECT_NAME } from './project-name.ts'
import { runCli } from './run-cli.ts'
import { listScenarios } from './scenarios.ts'

const CREATED_AT = /"createdAt": "[^"]+"/
const SNAPSHOT_PACKAGE_MANAGER = 'pnpm'

let cwd: string

beforeAll(async () => {
  cwd = await mkdtemp(join(tmpdir(), 'next-suite-scenarios-'))
})

afterAll(async () => {
  await rm(cwd, { recursive: true, force: true })
})

describe.each(listScenarios())('the scenario $name', ({ name, answers }) => {
  it('generates the files of its snapshot', async () => {
    const result = await runCli(
      'create-next-suite',
      [
        PROJECT_NAME,
        '--answers',
        answers,
        '--package-manager',
        SNAPSHOT_PACKAGE_MANAGER,
        '--yes',
        '--dry-run',
        '--diff',
      ],
      { cwd },
    )

    expect(result.stderr).toBe('')
    await expect(result.stdout.replace(CREATED_AT, '"createdAt": "<now>"')).toMatchFileSnapshot(
      `../snapshots/${name}.txt`,
    )
  })
})
