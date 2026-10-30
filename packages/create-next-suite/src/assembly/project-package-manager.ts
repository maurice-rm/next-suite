import type { ProjectPackageManager } from '../plugin-definition/plugin-context.ts'
import type { Plugin } from '../plugin-definition/plugin-definition.ts'

/** The package manager a project without a package manager plugin is run with. */
const FALLBACK_NAME = 'npm'
const FALLBACK_CI_INSTALL_ARGS = ['ci']

/** The package manager the project runs with: the one a plugin states, npm without one. */
export const projectPackageManager = (plugins: readonly Plugin[]): ProjectPackageManager => {
  const packageManagerPlugin = plugins.find((plugin) => plugin.packageManager !== undefined)
  const name = packageManagerPlugin?.name ?? FALLBACK_NAME
  const ciInstallArgs =
    packageManagerPlugin?.packageManager?.ciInstallArgs ?? FALLBACK_CI_INSTALL_ARGS
  return {
    name,
    ...(packageManagerPlugin?.packageManager === undefined
      ? {}
      : { version: packageManagerPlugin.packageManager.version }),
    run: `${name} run`,
    ciInstall: [name, ...ciInstallArgs].join(' '),
  }
}
