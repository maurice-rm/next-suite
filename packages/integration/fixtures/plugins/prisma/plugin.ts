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
  prisma: '7.10.1',
  '@prisma/client': '7.10.1',
  '@prisma/adapter-pg': '7.10.1',
  '@prisma/adapter-better-sqlite3': '7.10.1',
}
const SCHEMA_FILE = 'prisma/schema.prisma'
const CONFIG_FILE = 'prisma.config.ts'
const CLIENT_FILE = '@/lib/prisma.ts'
const HEALTH_FILE = '@/lib/database-health.ts'
const CLIENT_DIRECTORY = '@/generated/prisma'

/** The driver adapter Prisma Client talks to each database with; Prisma 7 needs one. */
const ADAPTERS: Record<Dialect, keyof typeof VERSIONS> = {
  postgresql: '@prisma/adapter-pg',
  sqlite: '@prisma/adapter-better-sqlite3',
}

/** The packages whose install scripts build or download what Prisma needs. */
const BUILT_DEPENDENCIES: Record<Dialect, readonly string[]> = {
  postgresql: ['prisma', '@prisma/engines'],
  sqlite: ['prisma', '@prisma/engines', 'better-sqlite3'],
}

/** The generator and the datasource; the output path is relative to the schema file. */
const schemaHeader = (dialect: Dialect, clientDirectory: string): string =>
  [
    'generator client {',
    '  provider = "prisma-client"',
    `  output   = "../${clientDirectory}"`,
    '}',
    '',
    'datasource db {',
    `  provider = "${dialect}"`,
    '}',
  ].join('\n')

export default definePlugin({
  name: 'prisma',
  title: 'Prisma ORM',
  description: 'Queries the database with Prisma ORM.',
  uses: { database, validatedEnv: optional(validatedEnv), health: optional(health) },
  provides: {
    orm: ({ database }) => ({
      kind: 'prisma',
      dialect: database.dialect,
      client: { name: 'prisma', from: '@/lib/prisma' },
    }),
  },
  collects: {
    databaseSchema: {
      create: createDatabaseSchema,
      finish: (schema, { database, diskPath, write }) => {
        const header = schemaHeader(database.dialect, diskPath(CLIENT_DIRECTORY))
        const models = schema.modules().map(({ code }) => code.trim())
        write(SCHEMA_FILE, `${[header, ...models].join('\n\n')}\n`)
      },
    },
  },
  dependencies: ({ database }) => ({
    '@prisma/client': VERSIONS['@prisma/client'],
    [ADAPTERS[database.dialect]]: VERSIONS[ADAPTERS[database.dialect]],
  }),
  devDependencies: ({ versionOf }) => ({
    prisma: VERSIONS.prisma,
    '@next/env': versionOf('next'),
  }),
  scripts: {
    postinstall: 'prisma generate',
    'db:generate': 'prisma generate',
    'db:migrate': 'prisma migrate dev',
    'db:push': 'prisma db push',
  },
  generatedDirectories: [CLIENT_DIRECTORY],
  files: ({ database, health }) => ({
    [CONFIG_FILE]: {
      source: `files/${CONFIG_FILE}`,
      edit: (config, { database }) =>
        config
          .defaultExportObject()
          .object('datasource')
          .set('url', `process.env.${database.urlVariable}`),
    },
    [CLIENT_FILE]: {
      source: `files/prisma.${database.dialect}.ts`,
      edit: (client, { database, validatedEnv }) => {
        client.setVariable('url', `process.env.${database.urlVariable}`)
        readFromValidatedEnv(client, validatedEnv, { url: database.urlVariable })
      },
    },
    ...(health === undefined ? {} : { [HEALTH_FILE]: 'files/database-health.ts' }),
  }),
  readme: ({ diskPath }) => ({
    'Prisma ORM': [
      `\`${diskPath(CLIENT_FILE)}\` exports the client \`prisma\`; models live in \`${SCHEMA_FILE}\`, and Prisma Client is generated after every install and by \`db:generate\`.`,
      '`db:push` applies the schema during development; `db:migrate` writes and applies a migration.',
    ].join(' '),
  }),
  extend: {
    builtDependencies: (built, { database }) => {
      for (const name of BUILT_DEPENDENCIES[database.dialect]) {
        built.allow(name)
      }
    },
    health: (checks) =>
      checks.check('database', { name: 'checkDatabase', from: '@/lib/database-health' }),
  },
})
