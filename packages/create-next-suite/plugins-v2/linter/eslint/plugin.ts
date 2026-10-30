import { createLintIgnores, definePlugin } from 'create-next-suite/plugin'

const VERSIONS = { eslint: '9.39.5', 'eslint-config-next': '16.4.3' }
const CONFIG_FILE = 'eslint.config.mjs'
/** The line that closes the list `globalIgnores` takes in the config. */
const IGNORES_END = '  ]),\n'

/** The config with each glob added to `globalIgnores`, one line each. */
const withIgnores = (config: string, globs: readonly string[]): string => {
  const end = config.indexOf(IGNORES_END)
  if (end === -1) {
    throw new Error(`${CONFIG_FILE} has no list of global ignores`)
  }
  const lines = globs.map((glob) => `    ${JSON.stringify(glob)},\n`).join('')
  return `${config.slice(0, end)}${lines}${config.slice(end)}`
}

export default definePlugin({
  name: 'eslint',
  title: 'ESLint',
  description: 'Lints with ESLint 9 and the Next.js rules for Core Web Vitals and TypeScript.',
  category: 'linter',
  devDependencies: VERSIONS,
  scripts: { lint: 'eslint' },
  stack: ['ESLint'],
  extend: {
    lintStaged: (lintStaged) => lintStaged.run('*.{js,jsx,mjs,cjs,ts,tsx}', 'eslint --fix'),
    ciChecks: (checks) => checks.run('lint'),
    builtDependencies: (builds) => builds.deny('unrs-resolver'),
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
