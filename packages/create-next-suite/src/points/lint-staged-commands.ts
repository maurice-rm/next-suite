/**
 * The commands lint-staged runs on the staged files, by glob, as the users of the point
 * `lintStaged` contribute them, such as the linter and the formatter; the lint-staged plugin
 * provides it and writes them into its config.
 */
export type LintStagedCommands = {
  /** Runs `command` on the staged files `glob` matches, such as `eslint --fix` on `*.ts`. */
  run: (glob: string, command: string) => void
  /** Each glob with its commands, in the order they were first given. */
  commands: () => ReadonlyMap<string, readonly string[]>
}

/**
 * Creates the collector of the point `lintStaged`, for the plugin that provides it, such as
 * lint-staged. A command given twice for a glob runs once.
 *
 * @returns An empty collector.
 *
 * @example
 * ```ts
 * definePlugin({
 *   name: 'acme-hooks',
 *   title: 'Acme hooks',
 *   category: 'git-hooks',
 *   collects: {
 *     lintStaged: {
 *       create: createLintStagedCommands,
 *       finish: (lintStaged, { write }) =>
 *         write('.lintstagedrc.json', JSON.stringify(Object.fromEntries(lintStaged.commands()))),
 *     },
 *   },
 * })
 * ```
 */
export const createLintStagedCommands = (): LintStagedCommands => {
  const commands = new Map<string, Set<string>>()
  return {
    run: (glob, command) => {
      commands.set(glob, (commands.get(glob) ?? new Set()).add(command))
    },
    commands: () => new Map([...commands].map(([glob, globCommands]) => [glob, [...globCommands]])),
  }
}
