import { definePlugin, optional } from 'create-next-suite/plugin'
import { createLogRedact, readFromValidatedEnv, validatedEnv } from 'create-next-suite/points'

const VERSIONS = { pino: '10.4.0' }
const LOGGER_FILE = '@/lib/logger.ts'
const LOGGER_OBJECT = 'logger'
const LEVEL_VARIABLE = 'LOG_LEVEL'

export default definePlugin({
  name: 'pino',
  title: 'Logging with pino',
  description: 'Logs with pino and reports server errors through instrumentation.ts.',
  category: 'logging',
  uses: { validatedEnv: optional(validatedEnv) },
  dependencies: VERSIONS,
  env: {
    [LEVEL_VARIABLE]: {
      scope: 'server',
      example: 'info',
      default: 'info',
      description: 'The lowest level pino logs: trace, debug, info, warn, error or fatal.',
    },
  },
  instrumentation: {
    onRequestError: [{ module: '@/lib/logger', export: 'reportRequestError' }],
  },
  stack: ['pino'],
  files: {
    [LOGGER_FILE]: {
      source: 'files/lib/logger.ts',
      edit: (logger, { validatedEnv }) =>
        readFromValidatedEnv(logger, validatedEnv, { level: LEVEL_VARIABLE }),
    },
  },
  collects: {
    logRedact: {
      create: createLogRedact,
      finish: (redact, { module }) => {
        const paths = redact.paths()
        if (paths.length > 0) {
          module(LOGGER_FILE)
            .object(LOGGER_OBJECT)
            .addToArray('redact', ...paths.map((path) => JSON.stringify(path)))
        }
      },
    },
  },
})
