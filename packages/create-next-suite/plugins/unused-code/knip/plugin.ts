import { definePlugin } from 'create-next-suite/plugin'
import { createKnipOptions } from 'create-next-suite/points'

const VERSIONS = { knip: '6.43.0' }
const CONFIG_FILE = 'knip.config.ts'
const CONFIG_OBJECT = 'config'
/** The project's next-suite config, which nothing imports but which imports create-next-suite. */
const SUITE_CONFIG_FILE = 'next-suite.config.ts'

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
      finish: (knip, { module, generatedDirectories, projectInputDirectory }) => {
        knip.entry(SUITE_CONFIG_FILE)
        knip.ignore(...generatedDirectories.map((directory) => `${directory}/**`))
        if (projectInputDirectory !== undefined) {
          knip.ignore(`${projectInputDirectory}/**`)
        }
        const config = module(CONFIG_FILE).object(CONFIG_OBJECT)
        for (const [key, values] of knip.options()) {
          config.set(key, stringList(values))
        }
      },
    },
  },
})
