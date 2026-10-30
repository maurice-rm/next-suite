import { definePlugin, optional } from 'create-next-suite/plugin'
import { readFromValidatedEnv, validatedEnv } from 'create-next-suite/points'

const VERSIONS = { pino: '10.4.0' }
const LOGGER_FILE = '@/lib/logger.ts'
const LOGGER_OBJECT = 'logger'
const LEVEL_VARIABLE = 'LOG_LEVEL'

/** The paths the logger hides from its output, as other plugins contribute them. */
type LogRedact = {
  /** Hides the values at these paths in every log line, such as `req.body.password`. */
  redact: (...paths: string[]) => void
  /** The paths in the order they were first given. */
  paths: () => readonly string[]
}

declare module 'create-next-suite/plugin' {
  interface CollectorPoints {
    /** The paths the logger hides from its output; the pino plugin provides it. */
    logRedact: LogRedact
  }
}

const createLogRedact = (): LogRedact => {
  const paths = new Set<string>()
  return {
    redact: (...added) => {
      for (const path of added) {
        paths.add(path)
      }
    },
    paths: () => [...paths],
  }
}

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
