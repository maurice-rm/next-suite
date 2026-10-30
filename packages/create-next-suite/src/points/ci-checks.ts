/**
 * The scripts CI runs on every change, as the users of the point `ciChecks` contribute them, such
 * as `lint`; the selected CI plugin provides it and runs them in its workflow.
 */
export type CiChecks = {
  /** Lets CI run a script of `package.json`. */
  run: (script: string) => void
  /** The scripts in the order they were first given. */
  scripts: () => readonly string[]
}

/**
 * Creates the collector of the point `ciChecks`, for the CI plugin that provides it. A script
 * given twice runs once.
 *
 * @returns An empty collector.
 *
 * @example
 * ```ts
 * definePlugin({
 *   name: 'acme-ci',
 *   title: 'Acme CI',
 *   category: 'ci',
 *   collects: {
 *     ciChecks: {
 *       create: createCiChecks,
 *       finish: (checks, { write }) => write('acme-ci.json', JSON.stringify(checks.scripts())),
 *     },
 *   },
 * })
 * ```
 */
export const createCiChecks = (): CiChecks => {
  const scripts = new Set<string>()
  return {
    run: (script) => {
      scripts.add(script)
    },
    scripts: () => [...scripts],
  }
}
