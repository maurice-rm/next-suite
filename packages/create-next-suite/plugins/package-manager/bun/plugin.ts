import { definePlugin } from 'create-next-suite/plugin'
import { createBuiltDependencies } from 'create-next-suite/points'

const VERSIONS = { bun: '1.4.4' }

export default definePlugin({
  name: 'bun',
  title: 'Bun',
  description:
    'Installs with Bun, takes new releases after a day and runs only the dependency builds this project allows.',
  category: 'package-manager',
  packageManager: {
    version: VERSIONS.bun,
    ciInstallArgs: ['install', '--frozen-lockfile'],
    whenVersionDiffers: 'warn',
  },
  files: { 'bunfig.toml': 'files/bunfig.toml' },
  collects: {
    builtDependencies: {
      create: createBuiltDependencies,
      finish: (builds, { packageJson }) =>
        packageJson.setField('trustedDependencies', [...builds.allowed()]),
    },
  },
})
