/**
 * The Prettier plugins the config loads, as the users of the point `prettierPlugins` contribute
 * them; the prettier plugin provides it and writes them into its config.
 */
export type PrettierPlugins = {
  /** Loads a Prettier plugin, such as `prettier-plugin-tailwindcss`. */
  add: (name: string) => void
  /** The plugins in the order they were first added. */
  names: () => readonly string[]
}

/**
 * Creates the collector of the point `prettierPlugins`, for the plugin that provides it, such as
 * prettier. A Prettier plugin added twice is loaded once.
 *
 * @returns An empty collector.
 *
 * @example
 * ```ts
 * definePlugin({
 *   name: 'acme-prettier',
 *   title: 'Acme Prettier',
 *   category: 'formatter',
 *   collects: {
 *     prettierPlugins: {
 *       create: createPrettierPlugins,
 *       finish: (plugins, { write }) =>
 *         write('.prettierrc', JSON.stringify({ plugins: plugins.names() })),
 *     },
 *   },
 * })
 * ```
 */
export const createPrettierPlugins = (): PrettierPlugins => {
  const names = new Set<string>()
  return {
    add: (name) => {
      names.add(name)
    },
    names: () => [...names],
  }
}
