/**
 * The shared points of create-next-suite: contracts between plugins that several plugins can
 * provide, so their users depend on the contract instead of a plugin. Value points carry what a
 * provider states: the database, the ORM and how code reads a validated environment variable.
 * Collector points gather what users contribute: the tables of the database, what the app's
 * container needs and the checks of the health route. A plugin branches on their values, such as
 * `orm.kind`, never on the names of other plugins.
 *
 * @example
 * ```ts
 * import { definePlugin } from 'create-next-suite/plugin'
 * import { databaseSchema, orm } from 'create-next-suite/points'
 *
 * export default definePlugin({
 *   name: 'blog',
 *   title: 'Blog',
 *   uses: { orm, databaseSchema },
 *   files: ({ orm }) => ({ '@/app/blog/list-posts.ts': `files/list-posts.${orm.kind}.ts` }),
 *   extend: {
 *     databaseSchema: (schema, { orm, readFile }) =>
 *       schema.add('blog', readFile(orm.kind === 'prisma' ? 'files/post.prisma' : `files/post.${orm.dialect}.ts`)),
 *   },
 * })
 * ```
 *
 * @packageDocumentation
 */
export {
  container,
  database,
  databaseSchema,
  health,
  orm,
  validatedEnv,
} from './plugin-definition/shared-points.ts'
export { type ComposeService, type Container, createContainer } from './points/container.ts'
export type { Database, Dialect } from './points/database.ts'
export {
  createDatabaseSchema,
  type DatabaseSchema,
  type SchemaModule,
} from './points/database-schema.ts'
export { createHealthChecks, type HealthCheck, type HealthChecks } from './points/health-checks.ts'
export type { Orm, OrmKind } from './points/orm.ts'
export { PointError } from './points/point-error.ts'
export { readFromValidatedEnv, type ValidatedEnv } from './points/validated-env.ts'
