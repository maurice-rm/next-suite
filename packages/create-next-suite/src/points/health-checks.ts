import { isDeepStrictEqual } from 'node:util'

import { PointError } from './point-error.ts'

/**
 * A check the health route runs: its name in the response, and the function that runs it, which
 * throws while what it checks is down.
 */
export type HealthCheck = {
  readonly name: string
  /** The import of the function, such as `{ name: 'checkDatabase', from: '@/db/health' }`. */
  readonly run: { readonly name: string; readonly from: string }
}

/**
 * The checks the health route runs, as the users of the point `health` contribute them; the
 * selected health plugin provides it and answers healthy only while every check passes.
 */
export type HealthChecks = {
  /**
   * Lets the health route run a check under a name, such as `database`.
   *
   * @throws PointError when another check was added under that name.
   */
  check: (name: string, run: HealthCheck['run']) => void
  /** The checks in the order they were added. */
  checks: () => readonly HealthCheck[]
}

/**
 * Creates the collector of the point `health`, for the health plugin that provides it. A check
 * added twice the same way is kept once.
 *
 * @returns An empty collector.
 *
 * @example
 * ```ts
 * definePlugin({
 *   name: 'health',
 *   title: 'Health route',
 *   collects: {
 *     health: {
 *       create: createHealthChecks,
 *       finish: (health, { module }) => {
 *         for (const { run } of health.checks()) {
 *           module('@/app/api/health/route.ts').addImport({ names: [run.name], from: run.from })
 *         }
 *       },
 *     },
 *   },
 * })
 * ```
 */
export const createHealthChecks = (): HealthChecks => {
  const checks = new Map<string, HealthCheck['run']>()
  return {
    check: (name, run) => {
      const present = checks.get(name)
      if (present !== undefined && !isDeepStrictEqual(present, run)) {
        throw new PointError(`the health route runs a check "${name}" already`)
      }
      checks.set(name, run)
    },
    checks: () => [...checks].map(([name, run]) => ({ name, run })),
  }
}
