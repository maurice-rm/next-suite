import { definePlugin } from 'create-next-suite/plugin'
import { createLintIgnores } from 'create-next-suite/points'

const VERSIONS = { '@biomejs/biome': '2.6.3' }
const CONFIG_FILE = 'biome.json'
/** The start of the files Biome checks; the ignored globs follow the first pattern. */
const INCLUDES_START = '"includes": ["**", '

/** The config with each glob excluded from the files Biome checks. */
const withIgnores = (config: string, globs: readonly string[]): string => {
  const start = config.indexOf(INCLUDES_START)
  if (start === -1) {
    throw new Error(`${CONFIG_FILE} has no list of included files`)
  }
  const end = start + INCLUDES_START.length
  const excluded = globs.map((glob) => `${JSON.stringify(`!${glob}`)}, `).join('')
  return `${config.slice(0, end)}${excluded}${config.slice(end)}`
}

export default definePlugin({
  name: 'biome',
  title: 'Biome',
  description: 'Lints and formats with Biome, with its Next.js and React rules.',
  category: 'linter',
  devDependencies: VERSIONS,
  scripts: {
    lint: 'biome check',
    format: 'biome format --write',
    'format:check': 'biome format',
  },
  stack: ['Biome'],
  postSteps: [{ script: 'format', running: 'Formatting files', done: 'Formatted files' }],
  extend: {
    lintStaged: (lintStaged) =>
      lintStaged.run(
        '*',
        'biome check --write --no-errors-on-unmatched --files-ignore-unknown=true',
      ),
    ciChecks: (checks) => checks.run('lint'),
  },
  collects: {
    lintIgnores: {
      create: createLintIgnores,
      finish: (ignores, { readFile, write, generatedDirectories }) => {
        ignores.ignore(...generatedDirectories.map((directory) => `${directory}/**`))
        write(CONFIG_FILE, withIgnores(readFile(`files/${CONFIG_FILE}`), ignores.globs()))
      },
    },
  },
})
