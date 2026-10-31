import { definePlugin } from 'create-next-suite/plugin'
import { createLintStagedCommands } from 'create-next-suite/points'

const VERSIONS = { husky: '9.1.7', 'lint-staged': '17.6.0' }
const CONFIG_FILE = 'lint-staged.config.mjs'
const CONFIG_OBJECT = 'config'

/** The commands of a glob as one line of code, the way the config has always written them. */
const commandList = (commands: readonly string[]): string =>
  `[${commands.map((command) => `${JSON.stringify(command)}, `).join('')}]`

export default definePlugin({
  name: 'lint-staged',
  title: 'lint-staged with Husky',
  description:
    'Lints and formats the staged files before each commit, through a Husky pre-commit hook.',
  category: 'git-hooks',
  precondition: ({ hasCategory }) =>
    hasCategory('linter') ||
    hasCategory('formatter') ||
    'it needs a linter or a formatter to run on the staged files',
  devDependencies: VERSIONS,
  scripts: { prepare: 'husky' },
  stack: ['Husky'],
  postSteps: [
    {
      script: 'prepare',
      running: 'Setting up Git hooks',
      done: 'Set up Git hooks',
      when: ({ initializesGit }) => initializesGit,
    },
  ],
  files: {
    [CONFIG_FILE]: `files/${CONFIG_FILE}`,
    '.husky/pre-commit': 'files/husky/pre-commit',
  },
  collects: {
    lintStaged: {
      create: createLintStagedCommands,
      finish: (lintStaged, { module }) => {
        const config = module(CONFIG_FILE).object(CONFIG_OBJECT)
        for (const [glob, globCommands] of lintStaged.commands()) {
          config.set(glob, commandList(globCommands))
        }
      },
    },
  },
})
