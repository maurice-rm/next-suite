import semver from 'semver'

import type { Category } from '../contract/category.ts'
import { PACKAGE_MANAGER_CATEGORY, type ParsedPluginManifest } from '../contract/plugin-manifest.ts'

const USER_AGENT = /^([a-z][a-z0-9-]*)\/(\S+)/

/** Versions of a package manager that cannot install a generated project, with the way out. */
const UNSUPPORTED_VERSIONS: Readonly<Record<string, { range: string; hint: string }>> = {
  yarn: {
    range: '<2',
    hint: 'Yarn 1 is not supported; get Yarn 4 through Corepack: npm install -g corepack && corepack enable',
  },
}

/** The package manager that started create-next-suite, with its version. */
export type InvokingPackageManager = { name: string; version: string }

/**
 * Reads the package manager that started create-next-suite from the user agent every package
 * manager sets, such as `pnpm/12.16.1 npm/? node/v24.12.0 linux x64`.
 */
export const detectPackageManager = (
  userAgent: string | undefined,
): InvokingPackageManager | undefined => {
  const match = USER_AGENT.exec(userAgent ?? '')
  const [, name, version] = match ?? []
  return name === undefined || version === undefined ? undefined : { name, version }
}

/** Answers why a version of a package manager cannot be used, or nothing when it can. */
export const findUnsupportedVersion = ({
  name,
  version,
}: InvokingPackageManager): string | undefined => {
  const unsupported = UNSUPPORTED_VERSIONS[name]
  const isUnsupported =
    unsupported !== undefined && semver.satisfies(semver.coerce(version) ?? '', unsupported.range)
  return isUnsupported ? unsupported.hint : undefined
}

/**
 * Answers the package manager that started create-next-suite when a plugin for it exists and its
 * version is supported, or nothing.
 */
export const findUsablePackageManager = (
  plugins: readonly ParsedPluginManifest[],
  invoking: InvokingPackageManager | undefined,
): string | undefined => {
  const isUsable =
    invoking !== undefined &&
    findUnsupportedVersion(invoking) === undefined &&
    plugins.some(
      (plugin) => plugin.category === PACKAGE_MANAGER_CATEGORY && plugin.name === invoking.name,
    )
  return isUsable ? invoking.name : undefined
}

/** Makes a package manager the default of the package manager question; nothing keeps it. */
export const preferPackageManager = (
  categories: readonly Category[],
  packageManager: string | undefined,
): Category[] =>
  categories.map((category) =>
    packageManager !== undefined &&
    category.id === PACKAGE_MANAGER_CATEGORY &&
    category.cardinality === 'one'
      ? { ...category, default: packageManager }
      : category,
  )
