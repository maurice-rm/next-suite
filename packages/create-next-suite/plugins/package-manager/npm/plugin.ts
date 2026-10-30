import { createBuiltDependencies, definePlugin } from 'create-next-suite/plugin'

const VERSIONS = { npm: '12.2.1' }

export default definePlugin({
  name: 'npm',
  title: 'npm',
  description:
    'Installs with npm, takes new releases after a day and fails on dependency builds that are not allowed.',
  category: 'package-manager',
  packageManager: {
    version: VERSIONS.npm,
    ciInstallArgs: ['ci'],
    whenVersionDiffers: 'warn',
  },
  files: { '.npmrc': 'files/npmrc' },
  collects: {
    builtDependencies: {
      create: createBuiltDependencies,
      finish: (builds, { packageJson }) =>
        packageJson.setField(
          'allowScripts',
          Object.fromEntries([
            ...builds.allowed().map((name) => [name, true]),
            ...builds.denied().map((name) => [name, false]),
          ]),
        ),
    },
  },
})
