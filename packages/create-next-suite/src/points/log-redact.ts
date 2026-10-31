/**
 * The paths the logger hides from its output, as the users of the point `logRedact` contribute
 * them; the pino plugin provides it and writes them into its logger.
 */
export type LogRedact = {
  /** Hides the values at these paths in every log line, such as `req.body.password`. */
  redact: (...paths: string[]) => void
  /** The paths in the order they were first given. */
  paths: () => readonly string[]
}

/**
 * Creates the collector of the point `logRedact`, for the plugin that provides it, such as pino. A
 * path given twice is kept once.
 *
 * @returns An empty collector.
 *
 * @example
 * ```ts
 * definePlugin({
 *   name: 'acme-logger',
 *   title: 'Acme logger',
 *   category: 'logging',
 *   collects: {
 *     logRedact: {
 *       create: createLogRedact,
 *       finish: (redact, { write }) => write('redact.json', JSON.stringify(redact.paths())),
 *     },
 *   },
 * })
 * ```
 */
export const createLogRedact = (): LogRedact => {
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
