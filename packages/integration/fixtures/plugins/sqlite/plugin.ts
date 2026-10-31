import { definePlugin } from 'create-next-suite/plugin'

const URL_VARIABLE = 'DATABASE_URL'
const DATABASE_FILE = 'dev.db'

export default definePlugin({
  name: 'sqlite',
  title: 'SQLite',
  description: 'Stores the data in a SQLite file.',
  provides: { database: { dialect: 'sqlite', urlVariable: URL_VARIABLE } },
  env: {
    [URL_VARIABLE]: {
      scope: 'server',
      example: `file:./${DATABASE_FILE}`,
      default: `file:./${DATABASE_FILE}`,
      description: 'The SQLite database file, relative to the project root.',
    },
  },
  gitignore: ['*.db', '*.db-journal'],
  readme: {
    Database: `The app uses SQLite. The database is the file \`${URL_VARIABLE}\` names, \`${DATABASE_FILE}\` by default; the first schema push creates it.`,
  },
})
