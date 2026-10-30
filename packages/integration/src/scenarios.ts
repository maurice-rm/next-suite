import { readdirSync } from 'node:fs'
import { basename, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const SCENARIO_DIRECTORY = fileURLToPath(new URL('../scenarios/', import.meta.url))
const SCENARIO_EXTENSION = '.json'

/** The package manager every scenario is snapshotted with. */
export const SNAPSHOT_PACKAGE_MANAGER = 'pnpm'

/** A scenario: the answer file a generated project is created from, and its name. */
export type Scenario = { name: string; answers: string }

/** Every scenario under `scenarios/`, by name. */
export const listScenarios = (): Scenario[] =>
  readdirSync(SCENARIO_DIRECTORY)
    .filter((file) => file.endsWith(SCENARIO_EXTENSION))
    .sort()
    .map((file) => ({
      name: basename(file, SCENARIO_EXTENSION),
      answers: join(SCENARIO_DIRECTORY, file),
    }))

/**
 * The snapshot of a scenario generated with a package manager, relative to `src/`: `<name>.txt`
 * with the snapshot package manager, `<name>.<package manager>.txt` with any other.
 */
export const snapshotOf = (scenario: string, packageManager: string): string =>
  packageManager === SNAPSHOT_PACKAGE_MANAGER
    ? `../snapshots/${scenario}.txt`
    : `../snapshots/${scenario}.${packageManager}.txt`
