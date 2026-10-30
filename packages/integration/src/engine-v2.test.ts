import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { dryRunScenario } from './dry-run-scenario.ts'
import {
  FROZEN_SCENARIOS,
  listScenarios,
  SNAPSHOT_PACKAGE_MANAGER,
  snapshotOf,
} from './scenarios.ts'

const PACKAGE_MANAGERS = ['pnpm', 'npm', 'yarn', 'bun']

/** Every scenario with each package manager it has a snapshot of. */
const cases = listScenarios().flatMap(({ name }) =>
  (FROZEN_SCENARIOS.includes(name) ? PACKAGE_MANAGERS : [SNAPSHOT_PACKAGE_MANAGER]).map(
    (packageManager) => ({ name, packageManager }),
  ),
)

let cwd: string

beforeAll(async () => {
  cwd = await mkdtemp(join(tmpdir(), 'next-suite-engine-v2-'))
})

afterAll(async () => {
  await rm(cwd, { recursive: true, force: true })
})

describe.each(cases)(
  'the scenario $name with $packageManager and NEXT_SUITE_ENGINE=v2',
  ({ name, packageManager }) => {
    it('generates the files of the snapshot the default engine recorded', async () => {
      const scenario = listScenarios().find((candidate) => candidate.name === name)
      if (scenario === undefined) {
        throw new Error(`the scenario ${name} is missing`)
      }

      const result = await dryRunScenario({ scenario, packageManager, cwd, engine: 'v2' })

      expect(result.stderr).toBe('')
      await expect(result.stdout).toMatchFileSnapshot(snapshotOf(name, packageManager))
    })
  },
)
