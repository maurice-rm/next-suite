/**
 * The points create-next-suite defines, with their types and collectors. The shared points are
 * contracts between plugins that several plugins can provide, so their users depend on the
 * contract instead of a plugin. Value points carry what a provider states: the database, the ORM
 * and how code reads a validated environment variable. Collector points gather what users
 * contribute: the tables of the database, what the app's container needs and the checks of the
 * health route. The points of the core gather the dependencies whose install scripts may run, the
 * globs the linter skips and the scripts CI runs. The points of the built-in plugins gather what
 * other plugins contribute to the tool behind them: `lintStaged`, `prettierPlugins`, `knip`,
 * `csp`, `logRedact`, `testSetup` and `agents`. A plugin branches on their values, such as
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
  agents,
  builtDependencies,
  ciChecks,
  container,
  csp,
  database,
  databaseSchema,
  health,
  knip,
  lintIgnores,
  lintStaged,
  logRedact,
  orm,
  prettierPlugins,
  testSetup,
  validatedEnv,
} from './plugin-definition/shared-points.ts'
export { type AgentSections, createAgentSections } from './points/agent-sections.ts'
export { type BuiltDependencies, createBuiltDependencies } from './points/built-dependencies.ts'
export { type CiChecks, createCiChecks } from './points/ci-checks.ts'
export { type ComposeService, type Container, createContainer } from './points/container.ts'
export { type CspSources, createCspSources } from './points/csp-sources.ts'
export type { Database, Dialect } from './points/database.ts'
export {
  createDatabaseSchema,
  type DatabaseSchema,
  type SchemaModule,
} from './points/database-schema.ts'
export { createHealthChecks, type HealthCheck, type HealthChecks } from './points/health-checks.ts'
export { createKnipOptions, type KnipOptions } from './points/knip-options.ts'
export { createLintIgnores, type LintIgnores } from './points/lint-ignores.ts'
export {
  createLintStagedCommands,
  type LintStagedCommands,
} from './points/lint-staged-commands.ts'
export { createLogRedact, type LogRedact } from './points/log-redact.ts'
export type { Orm, OrmKind } from './points/orm.ts'
export { PointError } from './points/point-error.ts'
export { createPrettierPlugins, type PrettierPlugins } from './points/prettier-plugins.ts'
export { createTestSetup, type TestSetup } from './points/test-setup.ts'
export { readFromValidatedEnv, type ValidatedEnv } from './points/validated-env.ts'
