import { readdirSync } from 'node:fs'
import { basename, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const SCENARIO_FOLDER = fileURLToPath(new URL('../scenarios/', import.meta.url))
const SCENARIO_EXTENSION = '.json'

/** A scenario: the answer file a generated project is created from, and its name. */
export type Scenario = { name: string; answers: string }

/** Every scenario under `scenarios/`, by name. */
export const listScenarios = (): Scenario[] =>
  readdirSync(SCENARIO_FOLDER)
    .filter((file) => file.endsWith(SCENARIO_EXTENSION))
    .sort()
    .map((file) => ({
      name: basename(file, SCENARIO_EXTENSION),
      answers: join(SCENARIO_FOLDER, file),
    }))
