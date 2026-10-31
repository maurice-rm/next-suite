import { describe, expectTypeOf, it } from 'vitest'

import { type CollectorPoints, definePlugin, optional, type ValuePoints } from './plugin.ts'
import {
  type Container,
  createContainer,
  createDatabaseSchema,
  createHealthChecks,
  type Database,
  type DatabaseSchema,
  type Dialect,
  database,
  databaseSchema,
  type HealthChecks,
  health,
  type Orm,
  type OrmKind,
  orm,
  readFromValidatedEnv,
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
