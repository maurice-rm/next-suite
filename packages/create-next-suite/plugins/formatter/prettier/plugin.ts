import { definePlugin } from 'create-next-suite/plugin'
import { createPrettierPlugins } from 'create-next-suite/points'

const VERSIONS = { prettier: '3.9.10' }
const CONFIG_FILE = 'prettier.config.mjs'
const CONFIG_OBJECT = 'config'

export default definePlugin({
  name: 'prettier',
  title: 'Prettier',
  description: 'Formats with Prettier.',
  category: 'formatter',
  conflicts: { biome: 'Biome formats the code already.' },
  devDependencies: VERSIONS,
  scripts: {
    format: 'prettier --write .',
    'format:check': 'prettier --check .',
  },
  stack: ['Prettier'],
  postSteps: [{ script: 'format', running: 'Formatting files', done: 'Formatted files' }],
  extend: {
    lintStaged: (lintStaged) => lintStaged.run('*', 'prettier --write --ignore-unknown'),
    ciChecks: (checks) => checks.run('format:check'),
  },
  files: {
    [CONFIG_FILE]: `files/${CONFIG_FILE}`,
    '.prettierignore': 'files/prettierignore',
  },
  collects: {
    prettierPlugins: {
      create: createPrettierPlugins,
      finish: (plugins, { module }) => {
        const names = plugins.names()
        if (names.length > 0) {
          const list = names.map((name) => `${JSON.stringify(name)}, `).join('')
          module(CONFIG_FILE).object(CONFIG_OBJECT).set('plugins', `[${list}]`)
        }
      },
    },
  },
})
