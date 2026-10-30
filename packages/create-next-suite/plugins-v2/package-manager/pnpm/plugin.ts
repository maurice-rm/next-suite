import { createBuiltDependencies, definePlugin } from 'create-next-suite/plugin'

const WORKSPACE_FILE = 'pnpm-workspace.yaml'

const decision = (name: string, isAllowed: boolean): string => `  "${name}": ${isAllowed}`

export default definePlugin({
  name: 'pnpm',
  title: 'pnpm',
  description:
    'Installs with pnpm, takes new releases after a day and runs only allowed dependency builds.',
  category: 'package-manager',
  packageManager: {
    version: '12.16.1',
    ciInstallArgs: ['install', '--frozen-lockfile'],
    whenVersionDiffers: 'download',
  },
  collects: {
    builtDependencies: {
      create: createBuiltDependencies,
      finish: (builds, { readFile, write }) => {
        const decisions = [
          ...builds.allowed().map((name) => decision(name, true)),
          ...builds.denied().map((name) => decision(name, false)),
        ]
        const allowBuilds = ['allowBuilds:', ...decisions].map((line) => `${line}\n`).join('')
        write(WORKSPACE_FILE, `${readFile(`files/${WORKSPACE_FILE}`)}${allowBuilds}`)
      },
    },
  },
})
