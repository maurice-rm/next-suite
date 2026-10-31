import { defineCollectorPoint } from './collector-point.ts'
import { defineValuePoint } from './value-point.ts'

/**
 * The selected database, stated by a database plugin such as one for PostgreSQL: `uses: { database }`
 * gives `database.dialect` and `database.urlVariable` in every function.
 */
export const database = defineValuePoint('database')

/**
 * The selected ORM, stated by an ORM plugin such as one for Drizzle: `uses: { orm }` gives
 * `orm.kind`, `orm.dialect` and `orm.client` in every function.
 */
export const orm = defineValuePoint('orm')

/**
 * How code reads a validated environment variable, stated by the plugin that validates them;
 * plugins use it as `optional(validatedEnv)` and read `process.env` without a provider.
 */
export const validatedEnv = defineValuePoint('validatedEnv')

/** The tables of the database, collected by the ORM plugin from every plugin that has tables. */
export const databaseSchema = defineCollectorPoint('databaseSchema')

/** What the app's container needs, collected by a container plugin. */
export const container = defineCollectorPoint('container')

/** The checks the health route runs, collected by a health plugin. */
export const health = defineCollectorPoint('health')

/** The dependencies whose install scripts may run, collected by the package manager plugin. */
export const builtDependencies = defineCollectorPoint('builtDependencies')

/** The globs the linter skips, collected by the linter plugin. */
export const lintIgnores = defineCollectorPoint('lintIgnores')

/** The scripts CI runs, collected by the CI plugin. */
export const ciChecks = defineCollectorPoint('ciChecks')

/** The commands lint-staged runs on the staged files, collected by the lint-staged plugin. */
export const lintStaged = defineCollectorPoint('lintStaged')

/** The Prettier plugins the config loads, collected by the prettier plugin. */
export const prettierPlugins = defineCollectorPoint('prettierPlugins')

/** Entry files, ignored files and dependencies Knip should not report, collected by the knip plugin. */
export const knip = defineCollectorPoint('knip')

/** The sources of the Content Security Policy, collected by the static-csp plugin. */
export const csp = defineCollectorPoint('csp')

/** The paths the logger hides from its output, collected by the pino plugin. */
export const logRedact = defineCollectorPoint('logRedact')

/** The setup files Vitest loads before the tests, collected by the vitest plugin. */
export const testSetup = defineCollectorPoint('testSetup')

/** The sections of AGENTS.md, the instructions for coding agents, collected by the agents-md plugin. */
export const agents = defineCollectorPoint('agents')
