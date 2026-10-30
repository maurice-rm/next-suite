import { createBuiltDependencies, definePlugin } from 'create-next-suite/plugin'

/** Yarn 4 is published on npm as @yarnpkg/cli-dist; the package `yarn` is Yarn 1. */
const VERSIONS = { '@yarnpkg/cli-dist': '4.18.1' }

export default definePlugin({
  name: 'yarn',
  title: 'Yarn',
  description:
    'Installs with Yarn 4 into node_modules, takes new releases after a day and runs only allowed dependency builds.',
  category: 'package-manager',
  packageManager: {
    version: VERSIONS['@yarnpkg/cli-dist'],
    installArgs: ['install', '--no-immutable'],
    ciInstallArgs: ['install', '--immutable'],
    whenVersionDiffers: 'warn',
  },
  gitignore: [
    '.yarn/*',
    '!.yarn/patches',
    '!.yarn/plugins',
    '!.yarn/releases',
    '!.yarn/sdks',
    '!.yarn/versions',
  ],
  files: { '.yarnrc.yml': 'files/yarnrc.yml' },
  collects: {
    builtDependencies: {
      create: createBuiltDependencies,
      finish: (builds, { packageJson }) =>
        packageJson.setField(
          'dependenciesMeta',
          Object.fromEntries([
            ...builds.allowed().map((name) => [name, { built: true }]),
            ...builds.denied().map((name) => [name, { built: false }]),
          ]),
        ),
    },
  },
})
