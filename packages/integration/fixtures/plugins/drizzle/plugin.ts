import { definePlugin, optional } from 'create-next-suite/plugin'
import {
  createDatabaseSchema,
  type Dialect,
  database,
  health,
  readFromValidatedEnv,
  validatedEnv,
} from 'create-next-suite/points'

const VERSIONS = {
  'drizzle-orm': '0.45.4',
  'drizzle-kit': '0.31.11',
  pg: '8.23.1',
  '@types/pg': '8.23.1',
  '@libsql/client': '0.18.0',
}
const CLIENT_FILE = '@/db/index.ts'
const HEALTH_FILE = '@/db/health.ts'
const SCHEMA_DIRECTORY = '@/db/schema'
const CONFIG_FILE = 'drizzle.config.ts'
const MIGRATIONS_DIRECTORY = 'drizzle'

/** The driver Drizzle talks to each database with, as its get-started guides install it. */
const DRIVERS: Record<
  Dialect,
  { dependencies: Record<string, string>; devDependencies: Record<string, string> }
> = {
  postgresql: {
    dependencies: { pg: VERSIONS.pg },
    devDependencies: { '@types/pg': VERSIONS['@types/pg'] },
  },
  sqlite: { dependencies: { '@libsql/client': VERSIONS['@libsql/client'] }, devDependencies: {} },
}

const exportOf = (name: string): string => `export * from "./${name}";`

export default definePlugin({
  name: 'drizzle',
  title: 'Drizzle ORM',
  description: 'Queries the database with Drizzle ORM.',
  uses: { database, validatedEnv: optional(validatedEnv), health: optional(health) },
  provides: {
    orm: ({ database }) => ({
      kind: 'drizzle',
      dialect: database.dialect,
      client: { name: 'db', from: '@/db' },
    }),
  },
  collects: {
    databaseSchema: {
      create: createDatabaseSchema,
      finish: (schema, { write }) => {
        const modules = schema.modules()
        for (const { name, code } of modules) {
          write(`${SCHEMA_DIRECTORY}/${name}.ts`, code)
        }
        const exports = modules.map(({ name }) => exportOf(name))
        write(
          `${SCHEMA_DIRECTORY}/index.ts`,
          exports.length === 0 ? 'export {};\n' : `${exports.join('\n')}\n`,
        )
      },
    },
  },
  dependencies: ({ database }) => ({
    'drizzle-orm': VERSIONS['drizzle-orm'],
    ...DRIVERS[database.dialect].dependencies,
  }),
  devDependencies: ({ database, versionOf }) => ({
    'drizzle-kit': VERSIONS['drizzle-kit'],
    '@next/env': versionOf('next'),
    ...DRIVERS[database.dialect].devDependencies,
  }),
  scripts: {
    'db:generate': 'drizzle-kit generate',
    'db:migrate': 'drizzle-kit migrate',
    'db:push': 'drizzle-kit push',
  },
  files: ({ database, health }) => ({
    [CLIENT_FILE]: {
      source: `files/db.${database.dialect}.ts`,
      edit: (client, { database, validatedEnv }) => {
        client.setVariable('url', `process.env.${database.urlVariable}!`)
        readFromValidatedEnv(client, validatedEnv, { url: database.urlVariable })
      },
    },
    [CONFIG_FILE]: {
      source: `files/${CONFIG_FILE}`,
      edit: (config, { database, diskPath }) => {
        const options = config.defaultExportObject()
        options.set('dialect', JSON.stringify(database.dialect))
        options.set('schema', JSON.stringify(`./${diskPath(SCHEMA_DIRECTORY)}`))
        options.object('dbCredentials').set('url', `process.env.${database.urlVariable}!`)
      },
    },
    ...(health === undefined ? {} : { [HEALTH_FILE]: `files/health.${database.dialect}.ts` }),
  }),
  readme: ({ diskPath }) => ({
    'Drizzle ORM': [
      `\`${diskPath(CLIENT_FILE)}\` exports the client \`db\`; tables live in \`${diskPath(SCHEMA_DIRECTORY)}/\`, one module per feature.`,
      `\`db:push\` applies the schema during development; \`db:generate\` and \`db:migrate\` write and apply migrations in \`${MIGRATIONS_DIRECTORY}/\`.`,
    ].join(' '),
  }),
  extend: {
    builtDependencies: (built) => built.allow('esbuild'),
    lintIgnores: (ignores) => ignores.ignore(`${MIGRATIONS_DIRECTORY}/**`),
    health: (checks) => checks.check('database', { name: 'checkDatabase', from: '@/db/health' }),
  },
})
