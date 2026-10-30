import { definePlugin } from 'create-next-suite/plugin'

const VERSIONS = { knip: '6.43.0' }
const CONFIG_FILE = 'knip.config.ts'
const CONFIG_OBJECT = 'config'
/** The project's next-suite config, which nothing imports but which imports create-next-suite. */
const SUITE_CONFIG_FILE = 'next-suite.config.ts'

/** What Knip treats differently, as other plugins contribute it. */
type KnipOptions = {
  /** Adds entry files, such as `drizzle.config.ts`. */
  entry: (...patterns: string[]) => void
  /** Lets Knip skip files. */
  ignore: (...patterns: string[]) => void
  /** Lets Knip not report dependencies as unused. */
  ignoreDependencies: (...names: string[]) => void
  /** The options that have values, in the order Knip documents them. */
  options: () => ReadonlyMap<string, readonly string[]>
}

declare module 'create-next-suite/plugin' {
  interface CollectorPoints {
    /** Entry files, ignored files and dependencies Knip should not report; the knip plugin provides it. */
    knip: KnipOptions
  }
}

const createKnipOptions = (): KnipOptions => {
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

/** A list of strings as code, one per line, the way the config has always written it. */
const stringList = (values: readonly string[]): string =>
  ['[', ...values.map((value) => `${JSON.stringify(value)},`), ']'].join('\n')

export default definePlugin({
  name: 'knip',
  title: 'Knip',
  description: 'Finds unused files, exports and dependencies with Knip.',
  category: 'unused-code',
  devDependencies: VERSIONS,
  scripts: { knip: 'knip' },
  stack: ['Knip'],
  extend: {
    ciChecks: (checks) => checks.run('knip'),
  },
  files: { [CONFIG_FILE]: `files/${CONFIG_FILE}` },
  collects: {
    knip: {
      create: createKnipOptions,
      finish: (knip, { module, generatedDirectories }) => {
        knip.entry(SUITE_CONFIG_FILE)
        knip.ignore(...generatedDirectories.map((directory) => `${directory}/**`))
        const config = module(CONFIG_FILE).object(CONFIG_OBJECT)
        for (const [key, values] of knip.options()) {
          config.set(key, stringList(values))
        }
      },
    },
  },
})
