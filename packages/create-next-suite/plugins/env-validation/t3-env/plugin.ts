import { definePlugin } from 'create-next-suite/plugin'

const VERSIONS = { '@t3-oss/env-nextjs': '0.13.11', zod: '4.6.7' }
const ENV_FILE = '@/env.ts'
const ENV_MODULE = '@/env'
const ENV_OBJECT = 'env'
/** Where t3-env reads the client variables, which Next.js inlines only when named in full. */
const CLIENT_RUNTIME_ENV = 'experimental__runtimeEnv'

/** The Zod schema of a variable as code: a string, with its default when it has one. */
const schemaOf = (variable: { default?: string }): string =>
  variable.default === undefined
    ? 'z.string()'
    : `z.string().default(${JSON.stringify(variable.default)})`

export default definePlugin({
  name: 't3-env',
  title: 't3-env',
  description: 'Validates environment variables with t3-env and Zod.',
  category: 'env-validation',
  dependencies: VERSIONS,
  provides: {
    validatedEnv: {
      import: { name: ENV_OBJECT, from: ENV_MODULE },
      reference: (variable) => `${ENV_OBJECT}.${variable}`,
    },
  },
  instrumentation: { register: [{ module: ENV_MODULE }] },
  stack: ['t3-env'],
  files: {
    [ENV_FILE]: {
      source: 'files/env.ts',
      edit: (module, { env }) => {
        const options = module.object(ENV_OBJECT)
        for (const variable of env) {
          options.object(variable.scope).set(variable.name, schemaOf(variable))
        }
        for (const variable of env.filter(({ scope }) => scope === 'client')) {
          options.object(CLIENT_RUNTIME_ENV).set(variable.name, `process.env.${variable.name}`)
        }
      },
    },
  },
})
