import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { dryRunScenario } from './dry-run-scenario.ts'
import { listScenarios, SNAPSHOT_PACKAGE_MANAGER, snapshotOf } from './scenarios.ts'

let cwd: string

beforeAll(async () => {
  cwd = await mkdtemp(join(tmpdir(), 'next-suite-scenarios-'))
})

afterAll(async () => {
  await rm(cwd, { recursive: true, force: true })
})

describe.each(listScenarios())('the scenario $name', (scenario) => {
  it('generates the files of its snapshot', async () => {
    const result = await dryRunScenario({
      scenario,
      packageManager: SNAPSHOT_PACKAGE_MANAGER,
      cwd,
    })

    expect(result.stderr).toBe('')
    await expect(result.stdout).toMatchFileSnapshot(
      snapshotOf(scenario.name, SNAPSHOT_PACKAGE_MANAGER),
    )
  })
})
