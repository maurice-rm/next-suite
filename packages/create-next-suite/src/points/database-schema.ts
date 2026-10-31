import { PointError } from './point-error.ts'

/** A module of tables, in the schema language of the selected ORM. */
export type SchemaModule = { readonly name: string; readonly code: string }

/**
 * The tables of the database, as the users of the point `databaseSchema` contribute them; the
 * selected ORM plugin provides it and writes them where its ORM reads its schema, such as one
 * Drizzle module per name or the models of `prisma/schema.prisma`. A contributor writes the code
 * in the language of `orm.kind` and `orm.dialect`.
 */
export type DatabaseSchema = {
  /**
   * Adds a module of tables under a name unique in the project, such as `auth`: Drizzle tables of
   * the dialect for Drizzle, models for Prisma.
   *
   * @throws PointError when another module was added under that name.
   */
  add: (name: string, code: string) => void
  /** The modules in the order they were added. */
  modules: () => readonly SchemaModule[]
}

/**
 * Creates the collector of the point `databaseSchema`, for the ORM plugin that provides it. A
 * module added twice with the same code is kept once.
 *
 * @returns An empty collector.
 *
 * @example
 * ```ts
 * definePlugin({
 *   name: 'drizzle',
 *   title: 'Drizzle ORM',
 *   collects: {
 *     databaseSchema: {
 *       create: createDatabaseSchema,
 *       finish: (schema, { write }) => {
 *         for (const { name, code } of schema.modules()) {
 *           write(`@/db/schema/${name}.ts`, code)
 *         }
 *       },
 *     },
 *   },
 * })
 * ```
 */
export const createDatabaseSchema = (): DatabaseSchema => {
  const modules = new Map<string, string>()
  return {
    add: (name, code) => {
      const present = modules.get(name)
      if (present !== undefined && present !== code) {
        throw new PointError(`the database schema has a module "${name}" already`)
      }
      modules.set(name, code)
    },
    modules: () => [...modules].map(([name, code]) => ({ name, code })),
  }
}
