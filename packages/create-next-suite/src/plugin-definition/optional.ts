import type { OptionalPoint, Point } from './used-point.ts'

/**
 * Makes a used point optional: the plugin runs without a provider, and the value it reads is
 * `undefined` then.
 *
 * @typeParam Used - The point.
 * @param point - A value point or a collector point.
 * @returns The point for `uses`.
 *
 * @example
 * ```ts
 * definePlugin({
 *   name: 'analytics',
 *   title: 'Analytics',
 *   uses: { csp: optional(csp) },
 *   scripts: ({ csp }) => (csp === undefined ? {} : { 'csp:check': 'node check-csp.ts' }),
 * })
 * ```
 */
export const optional = <Used extends Point>(point: Used): OptionalPoint<Used> => ({
  point,
  isOptional: true,
})
