/**
 * The sources of the Content Security Policy by directive, as the users of the point `csp` allow
 * them; the static-csp plugin provides it and writes them into the policy.
 */
export type CspSources = {
  /** Allows sources for a directive, such as `https://va.vercel-scripts.com` for `script-src`. */
  allow: (directive: string, ...sources: string[]) => void
  /** Each directive with its sources, in the order they were first allowed. */
  directives: () => ReadonlyMap<string, readonly string[]>
}

/**
 * Creates the collector of the point `csp`, for the plugin that provides it, such as static-csp. A
 * source allowed twice for a directive is kept once.
 *
 * @returns An empty collector.
 *
 * @example
 * ```ts
 * definePlugin({
 *   name: 'acme-csp',
 *   title: 'Acme CSP',
 *   category: 'security-headers',
 *   collects: {
 *     csp: {
 *       create: createCspSources,
 *       finish: (csp, { write }) =>
 *         write('csp.json', JSON.stringify(Object.fromEntries(csp.directives()))),
 *     },
 *   },
 * })
 * ```
 */
export const createCspSources = (): CspSources => {
  const sources = new Map<string, Set<string>>()
  return {
    allow: (directive, ...allowed) => {
      const present = sources.get(directive) ?? new Set()
      for (const source of allowed) {
        present.add(source)
      }
      sources.set(directive, present)
    },
    directives: () =>
      new Map([...sources].map(([directive, allowed]) => [directive, [...allowed]])),
  }
}
