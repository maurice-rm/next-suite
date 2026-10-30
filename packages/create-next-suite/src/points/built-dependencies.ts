/**
 * The dependencies whose install scripts may run, and those known to need none, as the users of
 * the point `builtDependencies` contribute them; the package manager plugin lists them where its
 * package manager reads them.
 */
export type BuiltDependencies = {
  /** Lets the install script of a dependency run, such as a native driver's. */
  allow: (name: string) => void
  /** Records a dependency whose install script is not needed, so it is not asked about. */
  deny: (name: string) => void
  /** The allowed dependencies, sorted by name. */
  allowed: () => readonly string[]
  /** The denied dependencies no plugin allows, sorted by name. */
  denied: () => readonly string[]
}

const sortedNames = (names: Iterable<string>): string[] =>
  [...names].sort((left, right) => (left < right ? -1 : 1))

/**
 * Creates the collector of the point `builtDependencies`, for the package manager plugin that
 * provides it. A dependency both allowed and denied counts as allowed.
 *
 * @returns An empty collector.
 *
 * @example
 * ```ts
 * definePlugin({
 *   name: 'bun',
 *   title: 'Bun',
 *   category: 'package-manager',
 *   collects: {
 *     builtDependencies: {
 *       create: createBuiltDependencies,
 *       finish: (builds, { packageJson }) =>
 *         packageJson.setField('trustedDependencies', [...builds.allowed()]),
 *     },
 *   },
 * })
 * ```
 */
export const createBuiltDependencies = (): BuiltDependencies => {
  const allowed = new Set<string>()
  const denied = new Set<string>()
  return {
    allow: (name) => {
      allowed.add(name)
    },
    deny: (name) => {
      denied.add(name)
    },
    allowed: () => sortedNames(allowed),
    denied: () => sortedNames([...denied].filter((name) => !allowed.has(name))),
  }
}
