/** The SQL dialects a database plugin can state, named the way Drizzle and Prisma name them. */
export type Dialect = 'postgresql' | 'sqlite'

/**
 * The selected database, as its plugin states it for the value point `database`: the dialect and
 * the environment variable holding the URL to connect with. The database plugin declares that
 * variable under `env`; an ORM plugin reads it to connect.
 */
export type Database = {
  /** The dialect, such as `postgresql`; an ORM plugin picks its driver by it. */
  readonly dialect: Dialect
  /** The environment variable holding the URL to connect with, such as `DATABASE_URL`. */
  readonly urlVariable: string
}
