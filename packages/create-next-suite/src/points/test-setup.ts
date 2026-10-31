/**
 * The setup files the test runner loads before the tests, as the users of the point `testSetup`
 * contribute them; the vitest plugin provides it and writes them into its config.
 */
export type TestSetup = {
  /** Loads setup files before the tests, such as `vitest.setup.ts`. */
  add: (...paths: string[]) => void
  /** The setup files in the order they were first added. */
  paths: () => readonly string[]
}

/**
 * Creates the collector of the point `testSetup`, for the plugin that provides it, such as vitest.
 * A setup file added twice is loaded once.
 *
 * @returns An empty collector.
 *
 * @example
 * ```ts
 * definePlugin({
 *   name: 'acme-tests',
 *   title: 'Acme tests',
 *   category: 'unit-tests',
 *   collects: {
 *     testSetup: {
 *       create: createTestSetup,
 *       finish: (setup, { write }) => write('setup-files.json', JSON.stringify(setup.paths())),
 *     },
 *   },
 * })
 * ```
 */
export const createTestSetup = (): TestSetup => {
  const paths = new Set<string>()
  return {
    add: (...added) => {
      for (const path of added) {
        paths.add(path)
      }
    },
    paths: () => [...paths],
  }
}
