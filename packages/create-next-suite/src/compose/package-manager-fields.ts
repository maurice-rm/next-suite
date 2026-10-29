import type { ParsedPluginManifest } from '../contract/plugin-manifest.ts'
import { resolveVersion, type VersionCatalog } from './merge-contributions.ts'

type PackageManager = NonNullable<ParsedPluginManifest['packageManager']>

const allowedBuildsFields = (
  place: PackageManager['allowedBuilds'],
  allowedBuilds: readonly string[],
): Record<string, unknown> => {
  switch (place) {
    case 'config-file':
      return {}
    case 'allow-scripts':
      return { allowScripts: Object.fromEntries(allowedBuilds.map((name) => [name, true])) }
    case 'dependencies-meta':
      return {
        dependenciesMeta: Object.fromEntries(allowedBuilds.map((name) => [name, { built: true }])),
      }
    case 'trusted-dependencies':
      return { trustedDependencies: [...allowedBuilds] }
  }
}

type PackageManagerFieldsInput = {
  name: string
  packageManager: PackageManager
  allowedBuilds: readonly string[]
  catalog: VersionCatalog
}

/**
 * The package.json fields of the selected package manager: `packageManager` with its exact
 * version, and the fields after the dependencies: `devEngines.packageManager` with the same
 * major, and the allowed dependency builds in the field the manager reads, unless its config file
 * holds them.
 */
export const packageManagerFields = ({
  name,
  packageManager,
  allowedBuilds,
  catalog,
}: PackageManagerFieldsInput): { packageManager: string; fields: Record<string, unknown> } => {
  const version = resolveVersion(packageManager.version, catalog, name)
  return {
    packageManager: `${name}@${version}`,
    fields: {
      devEngines: {
        packageManager: { name, version: `^${version}`, onFail: packageManager.onFail },
      },
      ...allowedBuildsFields(packageManager.allowedBuilds, allowedBuilds),
    },
  }
}
