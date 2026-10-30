import { definePlugin } from 'create-next-suite/plugin'

const URL_VARIABLE = 'DATABASE_URL'
const SERVICE = 'db'
const PASSWORD = 'postgres'
const IMAGE = 'postgres:18-alpine'

export default definePlugin({
  name: 'postgres',
  title: 'PostgreSQL',
  description: 'Stores the data in PostgreSQL.',
  provides: { database: { dialect: 'postgresql', urlVariable: URL_VARIABLE } },
  env: {
    [URL_VARIABLE]: {
      scope: 'server',
      example: `postgresql://postgres:${PASSWORD}@localhost:5432/postgres`,
      description: 'The URL of the PostgreSQL database.',
    },
  },
  readme: {
    Database: `The app uses PostgreSQL. Point \`${URL_VARIABLE}\` in \`.env.local\` to a running server, such as \`docker run -e POSTGRES_PASSWORD=${PASSWORD} -p 5432:5432 ${IMAGE}\`.`,
  },
  extend: {
    container: (container) => {
      container.service(SERVICE, { image: IMAGE, environment: { POSTGRES_PASSWORD: PASSWORD } })
      container.env(URL_VARIABLE, `postgresql://postgres:${PASSWORD}@${SERVICE}:5432/postgres`)
    },
  },
})
