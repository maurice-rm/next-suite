import {
  PACKAGE_JSON_FIELD_PREFIX,
  type ParsedPluginManifest,
} from '../contract/plugin-manifest.ts'
import type { VersionCatalog } from '../contract/version-catalog.ts'
import { resolveVersion } from './merge-contributions.ts'

type PackageManager = NonNullable<ParsedPluginManifest['packageManager']>

const allowedBuildsFields = (
  place: string,
  allowedBuilds: readonly string[],
): Record<string, unknown> => {
  const field = place.startsWith(PACKAGE_JSON_FIELD_PREFIX)
    ? place.slice(PACKAGE_JSON_FIELD_PREFIX.length)
    : undefined
  switch (field) {
    case 'allowScripts':
      return { allowScripts: Object.fromEntries(allowedBuilds.map((name) => [name, true])) }
    case 'dependenciesMeta':
      return {
        dependenciesMeta: Object.fromEntries(allowedBuilds.map((name) => [name, { built: true }])),
      }
    case 'trustedDependencies':
      return { trustedDependencies: [...allowedBuilds] }
    default:
      return {}
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
 * major, and the allowed dependency builds in the field the manager reads, unless a file of the
 * plugin holds them.
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
        packageManager: {
          name,
          version: `^${version}`,
          onFail: packageManager.whenVersionDiffers,
        },
      },
      ...allowedBuildsFields(packageManager.allowedBuildsIn, allowedBuilds),
    },
  }
}
