import { PACKAGE_MANAGER_CATEGORY } from '../plugin-definition/categories.ts'
import type { Plugin } from '../plugin-definition/plugin-definition.ts'
import { findUnsupportedVersion, type PackageManagerVersion } from './supported-versions.ts'

const USER_AGENT = /^([a-z][a-z0-9-]*)\/(\S+)/

/**
 * Reads the package manager that started create-next-suite from the user agent every package
 * manager sets, such as `pnpm/12.16.1 npm/? node/v24.12.0 linux x64`.
 */
export const detectPackageManager = (
  userAgent: string | undefined,
): PackageManagerVersion | undefined => {
  const match = USER_AGENT.exec(userAgent ?? '')
  const [, name, version] = match ?? []
  return name === undefined || version === undefined ? undefined : { name, version }
}

/**
 * Answers the package manager that started create-next-suite when a plugin for it exists and its
 * version is supported, or nothing.
 */
export const findUsablePackageManager = (
  plugins: readonly Pick<Plugin, 'name' | 'category'>[],
  invoking: PackageManagerVersion | undefined,
): string | undefined => {
  const isUsable =
    invoking !== undefined &&
    findUnsupportedVersion(invoking) === undefined &&
    plugins.some(
      (plugin) => plugin.category === PACKAGE_MANAGER_CATEGORY && plugin.name === invoking.name,
    )
  return isUsable ? invoking.name : undefined
}
