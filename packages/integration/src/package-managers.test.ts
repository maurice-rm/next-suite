import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { dryRunScenario } from './dry-run-scenario.ts'
import { listScenarios, snapshotOf } from './scenarios.ts'

/** The scenario with only the base project and a package manager. */
const BARE_SCENARIO = 'bare'
const OTHER_PACKAGE_MANAGERS = ['npm', 'yarn', 'bun']

const bare = listScenarios().find((scenario) => scenario.name === BARE_SCENARIO)

let cwd: string

beforeAll(async () => {
  cwd = await mkdtemp(join(tmpdir(), 'next-suite-package-managers-'))
})

afterAll(async () => {
  await rm(cwd, { recursive: true, force: true })
})

describe.each(OTHER_PACKAGE_MANAGERS)('the scenario bare with %s', (packageManager) => {
  it('generates the files of its snapshot', async () => {
    if (bare === undefined) {
      throw new Error(`the scenario ${BARE_SCENARIO} is missing`)
    }

    const result = await dryRunScenario({ scenario: bare, packageManager, cwd })

    expect(result.stderr).toBe('')
    await expect(result.stdout).toMatchFileSnapshot(snapshotOf(BARE_SCENARIO, packageManager))
  })
})
