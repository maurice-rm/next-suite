import type { Dialect } from './database.ts'

/** The ORMs an ORM plugin can state. */
export type OrmKind = 'drizzle' | 'prisma'

/**
 * The selected ORM, as its plugin states it for the value point `orm`: which ORM, the dialect of
 * the database it talks to, and where its client is imported from. A plugin that integrates with
 * the database branches on `kind` and `dialect`, never on plugin names.
 */
export type Orm = {
  /** The ORM, such as `drizzle`. */
  readonly kind: OrmKind
  /** The dialect of the database, as the database plugin states it. */
  readonly dialect: Dialect
  /** The import of the client, such as `{ name: 'db', from: '@/db' }`. */
  readonly client: { readonly name: string; readonly from: string }
}
