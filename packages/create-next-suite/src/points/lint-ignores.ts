/**
 * The globs the linter skips, as the users of the point `lintIgnores` contribute them; the
 * selected linter plugin provides it and writes them into its config.
 */
export type LintIgnores = {
  /** Lets the linter skip the files the globs match, such as `drizzle/**`. */
  ignore: (...globs: string[]) => void
  /** The globs in the order they were first given. */
  globs: () => readonly string[]
}

/**
 * Creates the collector of the point `lintIgnores`, for the linter plugin that provides it. A glob
 * given twice is kept once.
 *
 * @returns An empty collector.
 *
 * @example
 * ```ts
 * definePlugin({
 *   name: 'eslint',
 *   title: 'ESLint',
 *   category: 'linter',
 *   collects: {
 *     lintIgnores: {
 *       create: createLintIgnores,
 *       finish: (ignores, { write }) => write('eslint.ignores.json', JSON.stringify(ignores.globs())),
 *     },
 *   },
 * })
 * ```
 */
export const createLintIgnores = (): LintIgnores => {
  const globs = new Set<string>()
  return {
    ignore: (...added) => {
      for (const glob of added) {
        globs.add(glob)
      }
    },
    globs: () => [...globs],
  }
}
