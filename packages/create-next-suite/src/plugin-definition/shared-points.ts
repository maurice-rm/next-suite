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
