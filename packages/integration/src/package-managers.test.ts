import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { dryRunScenario } from './dry-run-scenario.ts'
import { FROZEN_SCENARIOS, listScenarios, snapshotOf } from './scenarios.ts'

const OTHER_PACKAGE_MANAGERS = ['npm', 'yarn', 'bun']

const cases = FROZEN_SCENARIOS.flatMap((name) =>
  OTHER_PACKAGE_MANAGERS.map((packageManager) => ({ name, packageManager })),
)

let cwd: string

beforeAll(async () => {
  cwd = await mkdtemp(join(tmpdir(), 'next-suite-package-managers-'))
})

afterAll(async () => {
  await rm(cwd, { recursive: true, force: true })
})

describe.each(cases)('the scenario $name with $packageManager', ({ name, packageManager }) => {
  it('generates the files of its snapshot', async () => {
    const scenario = listScenarios().find((candidate) => candidate.name === name)
    if (scenario === undefined) {
      throw new Error(`the scenario ${name} is missing`)
    }

    const result = await dryRunScenario({ scenario, packageManager, cwd })

    expect(result.stderr).toBe('')
    await expect(result.stdout).toMatchFileSnapshot(snapshotOf(name, packageManager))
  })
})
