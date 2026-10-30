import { definePlugin } from 'create-next-suite/plugin'

const VERSIONS = { husky: '9.1.7', 'lint-staged': '17.6.0' }
const CONFIG_FILE = 'lint-staged.config.mjs'
const CONFIG_OBJECT = 'config'

/**
 * The commands lint-staged runs on the staged files, by glob, as the linter and formatter plugins
 * contribute them.
 */
type LintStagedCommands = {
  /** Runs `command` on the staged files `glob` matches, such as `eslint --fix` on `*.ts`. */
  run: (glob: string, command: string) => void
  /** Each glob with its commands, in the order they were first given. */
  commands: () => ReadonlyMap<string, readonly string[]>
}

declare module 'create-next-suite/plugin' {
  interface CollectorPoints {
    /** The commands lint-staged runs on the staged files; the lint-staged plugin provides it. */
    lintStaged: LintStagedCommands
  }
}

const createLintStagedCommands = (): LintStagedCommands => {
  const commands = new Map<string, Set<string>>()
  return {
    run: (glob, command) => {
      commands.set(glob, (commands.get(glob) ?? new Set()).add(command))
    },
    commands: () => new Map([...commands].map(([glob, globCommands]) => [glob, [...globCommands]])),
  }
}

/** The commands of a glob as one line of code, the way the config has always written them. */
const commandList = (commands: readonly string[]): string =>
  `[${commands.map((command) => `${JSON.stringify(command)}, `).join('')}]`

export default definePlugin({
  name: 'lint-staged',
  title: 'lint-staged with Husky',
  description:
    'Lints and formats the staged files before each commit, through a Husky pre-commit hook.',
  category: 'git-hooks',
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
      finish: (lintStaged, { module, fail }) => {
        const commands = lintStaged.commands()
        if (commands.size === 0) {
          fail('it needs a linter or a formatter to run on the staged files')
        }
        const config = module(CONFIG_FILE).object(CONFIG_OBJECT)
        for (const [glob, globCommands] of commands) {
          config.set(glob, commandList(globCommands))
        }
      },
    },
  },
})
