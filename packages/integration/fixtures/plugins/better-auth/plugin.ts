import { definePlugin } from 'create-next-suite/plugin'
import { type Dialect, databaseSchema, type OrmKind, orm } from 'create-next-suite/points'

const VERSIONS = {
  'better-auth': '1.7.14',
  '@better-auth/drizzle-adapter': '1.7.14',
  '@better-auth/prisma-adapter': '1.7.14',
  auth: '1.7.14',
}
const AUTH_FILE = '@/lib/auth.ts'
const AUTH_OBJECT = 'auth'
const LOCAL_URL = 'http://localhost:3000'

/** The adapter of each ORM: its package, its function and the name it gives each dialect. */
const ADAPTERS: Record<
  OrmKind,
  { from: keyof typeof VERSIONS; name: string; providers: Record<Dialect, string> }
> = {
  drizzle: {
    from: '@better-auth/drizzle-adapter',
    name: 'drizzleAdapter',
    providers: { postgresql: 'pg', sqlite: 'sqlite' },
  },
  prisma: {
    from: '@better-auth/prisma-adapter',
    name: 'prismaAdapter',
    providers: { postgresql: 'postgresql', sqlite: 'sqlite' },
  },
}

/**
 * The tables better-auth writes, as `auth generate` of better-auth 1.7.14 writes them for each
 * ORM and dialect; `auth:check` checks them against the installed version.
 */
const SCHEMA_FILES: Record<OrmKind, Record<Dialect, string>> = {
  drizzle: {
    postgresql: 'files/auth-schema.postgresql.ts',
    sqlite: 'files/auth-schema.sqlite.ts',
  },
  prisma: { postgresql: 'files/auth.prisma', sqlite: 'files/auth.prisma' },
}

export default definePlugin({
  name: 'better-auth',
  title: 'Better Auth',
  description: 'Signs users in with email and password through Better Auth.',
  uses: { orm, databaseSchema },
  options: {
    signUp: {
      question: 'Can visitors create an account themselves?',
      choices: ['open', 'closed'],
      default: 'open',
    },
  },
  dependencies: ({ orm }) => ({
    'better-auth': VERSIONS['better-auth'],
    [ADAPTERS[orm.kind].from]: VERSIONS[ADAPTERS[orm.kind].from],
  }),
  devDependencies: { auth: VERSIONS.auth },
  scripts: { 'auth:check': 'auth check schema' },
  env: {
    BETTER_AUTH_SECRET: {
      scope: 'server',
      example: 'replace-with-the-output-of-openssl-rand-base64-32',
      description:
        'Encrypts and signs sessions; at least 32 characters, such as `openssl rand -base64 32`.',
    },
    BETTER_AUTH_URL: {
      scope: 'server',
      example: LOCAL_URL,
      default: LOCAL_URL,
      description: 'The base URL of the app.',
    },
  },
  files: {
    [AUTH_FILE]: {
      source: 'files/auth.ts',
      edit: (auth, { orm, options }) => {
        const adapter = ADAPTERS[orm.kind]
        const config = auth.object(AUTH_OBJECT)
        if (options.signUp === 'closed') {
          config.object('emailAndPassword').set('disableSignUp', 'true')
        }
        auth.addImport({ names: [adapter.name], from: adapter.from })
        auth.addImport({ names: [orm.client.name], from: orm.client.from })
        config.set(
          'database',
          `${adapter.name}(${orm.client.name}, { provider: ${JSON.stringify(adapter.providers[orm.dialect])} })`,
        )
      },
    },
    '@/app/api/auth/[...all]/route.ts': 'files/route.ts',
  },
  extend: {
    databaseSchema: (schema, { orm, readFile }) =>
      schema.add('auth', readFile(SCHEMA_FILES[orm.kind][orm.dialect])),
  },
})
