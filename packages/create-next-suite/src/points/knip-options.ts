/**
 * What Knip treats differently, as the users of the point `knip` contribute it; the knip plugin
 * provides it and writes it into the Knip config.
 */
export type KnipOptions = {
  /** Adds entry files, such as `drizzle.config.ts`. */
  entry: (...patterns: string[]) => void
  /** Lets Knip skip files. */
  ignore: (...patterns: string[]) => void
  /** Lets Knip not report dependencies as unused. */
  ignoreDependencies: (...names: string[]) => void
  /** The options that have values, in the order Knip documents them. */
  options: () => ReadonlyMap<string, readonly string[]>
}

/**
 * Creates the collector of the point `knip`, for the plugin that provides it, such as knip. A value
 * given twice for an option is kept once.
 *
 * @returns An empty collector.
 *
 * @example
 * ```ts
 * definePlugin({
 *   name: 'acme-knip',
 *   title: 'Acme Knip',
 *   category: 'unused-code',
 *   collects: {
 *     knip: {
 *       create: createKnipOptions,
 *       finish: (knip, { write }) =>
 *         write('knip.json', JSON.stringify(Object.fromEntries(knip.options()))),
 *     },
 *   },
 * })
 * ```
 */
export const createKnipOptions = (): KnipOptions => {
  const options = {
    entry: new Set<string>(),
    ignore: new Set<string>(),
    ignoreDependencies: new Set<string>(),
  }
  const adder =
    (values: Set<string>) =>
    (...added: string[]): void => {
      for (const value of added) {
        values.add(value)
      }
    }
  return {
    entry: adder(options.entry),
    ignore: adder(options.ignore),
    ignoreDependencies: adder(options.ignoreDependencies),
    options: () =>
      new Map(
        Object.entries(options)
          .filter(([, values]) => values.size > 0)
          .map(([key, values]) => [key, [...values]]),
      ),
  }
}
