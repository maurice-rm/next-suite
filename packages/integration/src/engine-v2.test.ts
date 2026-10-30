import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { dryRunScenario } from './dry-run-scenario.ts'
import { listScenarios, snapshotOf } from './scenarios.ts'

/** The scenario the engine of plugins written as plugin.ts generates so far. */
const BARE_SCENARIO = 'bare'
const PACKAGE_MANAGERS = ['pnpm', 'npm', 'yarn', 'bun']

const bare = listScenarios().find((scenario) => scenario.name === BARE_SCENARIO)

let cwd: string

beforeAll(async () => {
  cwd = await mkdtemp(join(tmpdir(), 'next-suite-engine-v2-'))
})

afterAll(async () => {
  await rm(cwd, { recursive: true, force: true })
})

describe.each(PACKAGE_MANAGERS)(
  'the scenario bare with %s and NEXT_SUITE_ENGINE=v2',
  (packageManager) => {
    it('generates the files of the snapshot the default engine recorded', async () => {
      if (bare === undefined) {
        throw new Error(`the scenario ${BARE_SCENARIO} is missing`)
      }

      const result = await dryRunScenario({ scenario: bare, packageManager, cwd, engine: 'v2' })

      expect(result.stderr).toBe('')
      await expect(result.stdout).toMatchFileSnapshot(snapshotOf(BARE_SCENARIO, packageManager))
    })
  },
)
