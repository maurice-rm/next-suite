import { describe, expectTypeOf, it } from 'vitest'

import { type CollectorPoints, definePlugin, optional, type ValuePoints } from './plugin.ts'
import {
  type AgentSections,
  agents,
  type BuiltDependencies,
  builtDependencies,
  type CiChecks,
  type Container,
  type CspSources,
  ciChecks,
  createAgentSections,
  createBuiltDependencies,
  createCiChecks,
  createContainer,
  createCspSources,
  createDatabaseSchema,
  createHealthChecks,
  createKnipOptions,
  createLintIgnores,
  createLintStagedCommands,
  createLogRedact,
  createPrettierPlugins,
  createTestSetup,
  csp,
  type Database,
  type DatabaseSchema,
  type Dialect,
  database,
  databaseSchema,
  type HealthChecks,
  health,
  type KnipOptions,
  knip,
  type LintIgnores,
  type LintStagedCommands,
  type LogRedact,
  lintIgnores,
  lintStaged,
  logRedact,
  type Orm,
  type OrmKind,
  orm,
  type PrettierPlugins,
  prettierPlugins,
  readFromValidatedEnv,
  type TestSetup,
  testSetup,
  type ValidatedEnv,
  validatedEnv,
} from './points.ts'

const NAMES = { name: 'acme', title: 'Acme' }

describe('create-next-suite/points', () => {
  it('registers the shared value points and their values', () => {
    expectTypeOf<ValuePoints['database']>().toEqualTypeOf<Database>()
    expectTypeOf<ValuePoints['orm']>().toEqualTypeOf<Orm>()
    expectTypeOf<ValuePoints['validatedEnv']>().toEqualTypeOf<ValidatedEnv>()
    expectTypeOf<Database['dialect']>().toEqualTypeOf<Dialect>()
    expectTypeOf<Orm['kind']>().toEqualTypeOf<OrmKind>()
  })

  it('registers the shared collector points and creates their collectors', () => {
    expectTypeOf<CollectorPoints['databaseSchema']>().toEqualTypeOf<DatabaseSchema>()
    expectTypeOf<CollectorPoints['container']>().toEqualTypeOf<Container>()
    expectTypeOf<CollectorPoints['health']>().toEqualTypeOf<HealthChecks>()
    expectTypeOf(createDatabaseSchema).returns.toEqualTypeOf<DatabaseSchema>()
    expectTypeOf(createContainer).returns.toEqualTypeOf<Container>()
    expectTypeOf(createHealthChecks).returns.toEqualTypeOf<HealthChecks>()
  })

  it('registers the points of the core and creates their collectors', () => {
    expectTypeOf<CollectorPoints['builtDependencies']>().toEqualTypeOf<BuiltDependencies>()
    expectTypeOf<CollectorPoints['lintIgnores']>().toEqualTypeOf<LintIgnores>()
    expectTypeOf<CollectorPoints['ciChecks']>().toEqualTypeOf<CiChecks>()
    expectTypeOf(createBuiltDependencies).returns.toEqualTypeOf<BuiltDependencies>()
    expectTypeOf(createLintIgnores).returns.toEqualTypeOf<LintIgnores>()
    expectTypeOf(createCiChecks).returns.toEqualTypeOf<CiChecks>()
    definePlugin({
      ...NAMES,
      uses: { builtDependencies, lintIgnores: optional(lintIgnores), ciChecks: optional(ciChecks) },
      extend: {
        builtDependencies: (built) => built.allow('esbuild'),
        lintIgnores: (ignores) => ignores.ignore('drizzle/**'),
        ciChecks: (checks) => checks.run('lint'),
      },
    })
  })

  it('registers the points of the built-in plugins and creates their collectors', () => {
    expectTypeOf<CollectorPoints['lintStaged']>().toEqualTypeOf<LintStagedCommands>()
    expectTypeOf<CollectorPoints['prettierPlugins']>().toEqualTypeOf<PrettierPlugins>()
    expectTypeOf<CollectorPoints['knip']>().toEqualTypeOf<KnipOptions>()
    expectTypeOf<CollectorPoints['csp']>().toEqualTypeOf<CspSources>()
    expectTypeOf<CollectorPoints['logRedact']>().toEqualTypeOf<LogRedact>()
    expectTypeOf<CollectorPoints['testSetup']>().toEqualTypeOf<TestSetup>()
    expectTypeOf<CollectorPoints['agents']>().toEqualTypeOf<AgentSections>()
    expectTypeOf(createLintStagedCommands).returns.toEqualTypeOf<LintStagedCommands>()
    expectTypeOf(createPrettierPlugins).returns.toEqualTypeOf<PrettierPlugins>()
    expectTypeOf(createKnipOptions).returns.toEqualTypeOf<KnipOptions>()
    expectTypeOf(createCspSources).returns.toEqualTypeOf<CspSources>()
    expectTypeOf(createLogRedact).returns.toEqualTypeOf<LogRedact>()
    expectTypeOf(createTestSetup).returns.toEqualTypeOf<TestSetup>()
    expectTypeOf(createAgentSections).returns.toEqualTypeOf<AgentSections>()
  })

  it('lets any plugin contribute to the points of the built-in plugins', () => {
    definePlugin({
      ...NAMES,
      uses: {
        csp: optional(csp),
        knip: optional(knip),
        logRedact: optional(logRedact),
        lintStaged: optional(lintStaged),
        prettierPlugins: optional(prettierPlugins),
        testSetup: optional(testSetup),
        agents: optional(agents),
      },
      extend: {
        csp: (sources) => sources.allow('connect-src', 'https://api.acme.dev'),
        knip: (options) => options.entry('lib/acme-client.ts'),
        logRedact: (redact) => redact.redact('req.body.token'),
        lintStaged: (commands) => commands.run('*.md', 'markdownlint --fix'),
        prettierPlugins: (plugins) => plugins.add('prettier-plugin-acme'),
        testSetup: (setup) => setup.add('acme.setup.ts'),
        agents: (sections) => sections.addSection('Acme', 'Call the API through `lib/acme`.'),
      },
    })
    definePlugin({
      ...NAMES,
      extend: {
        // @ts-expect-error -- a directive takes its sources as strings
        csp: (sources) => sources.allow('connect-src', ['https://api.acme.dev']),
        // @ts-expect-error -- Knip has no option `entries`
        knip: (options) => options.entries('lib/acme-client.ts'),
      },
    })
  })

  it('checks what a provider states', () => {
    definePlugin({
      ...NAMES,
      provides: { database: { dialect: 'postgresql', urlVariable: 'DATABASE_URL' } },
    })
    definePlugin({
      ...NAMES,
      // @ts-expect-error -- MySQL is no dialect of the contract
      provides: { database: { dialect: 'mysql', urlVariable: 'DATABASE_URL' } },
    })
    definePlugin({
      ...NAMES,
      uses: { database },
      provides: {
        orm: ({ database }) => ({
          kind: 'drizzle',
          dialect: database.dialect,
          client: { name: 'db', from: '@/db' },
        }),
      },
    })
  })

  it('hands every user the value of a used point and a table per axis', () => {
    const adapters: Record<OrmKind, string> = { drizzle: 'drizzleAdapter', prisma: 'prismaAdapter' }
    definePlugin({
      ...NAMES,
      uses: { orm, databaseSchema, health: optional(health) },
      dependencies: ({ orm, databaseSchema, health }) => {
        expectTypeOf(orm.client).toEqualTypeOf<{ readonly name: string; readonly from: string }>()
        expectTypeOf(databaseSchema).toEqualTypeOf<true>()
        expectTypeOf(health).toEqualTypeOf<true | undefined>()
        return { [adapters[orm.kind]]: '1.0.0' }
      },
      extend: {
        databaseSchema: (schema, { orm }) => schema.add('acme', `-- ${orm.dialect}`),
        container: (container) => container.service('db', { image: 'postgres:18-alpine' }),
        health: (checks) =>
          checks.check('database', { name: 'checkDatabase', from: '@/db/health' }),
      },
    })
  })

  it('reads validated variables in a file edit, and refuses the name env for the point', () => {
    definePlugin({
      ...NAMES,
      uses: { validatedEnv: optional(validatedEnv) },
      files: {
        '@/lib/acme.ts': {
          source: 'files/acme.ts',
          edit: (module, { validatedEnv }) => {
            expectTypeOf(validatedEnv).toEqualTypeOf<ValidatedEnv | undefined>()
            readFromValidatedEnv(module, validatedEnv, { level: 'LOG_LEVEL' })
          },
        },
      },
    })
    definePlugin({
      ...NAMES,
      // @ts-expect-error -- `env` is the context's list of environment variables
      uses: { env: optional(validatedEnv) },
    })
  })
})
