import { PACKAGE_JSON_FIELD_PREFIX } from '../contract/allowed-builds-location.ts'
import type { ParsedPluginManifest } from '../contract/plugin-manifest.ts'
import type { VersionCatalog } from '../contract/version-catalog.ts'
import type { LoadedPlugin } from '../loader/load-plugin.ts'
import { resolveVersion } from './resolve-version.ts'

type PackageManager = NonNullable<ParsedPluginManifest['packageManager']>

/**
 * The selected package manager plugin: its name, which is the command, and how the core uses it.
 */
export type SelectedPackageManager = { name: string; packageManager: PackageManager }

/** The dependencies whose install scripts may run, and those known to need none. */
type Builds = { allowed: readonly string[]; denied: readonly string[] }

type PackageManagerFieldsInput = SelectedPackageManager & {
  builds: Builds
  catalog: VersionCatalog
}

const decisions = <Value>({ allowed, denied }: Builds, allow: Value, deny: Value) =>
  Object.fromEntries([
    ...allowed.map((name) => [name, allow] as const),
    ...denied.map((name) => [name, deny] as const),
  ])

const allowedBuildsFields = (place: string, builds: Builds): Record<string, unknown> => {
  const field = place.startsWith(PACKAGE_JSON_FIELD_PREFIX)
    ? place.slice(PACKAGE_JSON_FIELD_PREFIX.length)
    : undefined
  switch (field) {
    case 'allowScripts':
      return { allowScripts: decisions(builds, true, false) }
    case 'dependenciesMeta':
      return { dependenciesMeta: decisions(builds, { built: true }, { built: false }) }
    case 'trustedDependencies':
      return { trustedDependencies: [...builds.allowed] }
    default:
      return {}
  }
}

/** The first selected plugin that describes a package manager, if any. */
export const findPackageManager = (
  selected: readonly LoadedPlugin[],
): SelectedPackageManager | undefined =>
  selected.flatMap(({ manifest }) =>
    manifest.packageManager === undefined
      ? []
      : [{ name: manifest.name, packageManager: manifest.packageManager }],
  )[0]

/**
 * The package.json fields of the selected package manager: `packageManager` with its exact
 * version, and the fields after the dependencies: `devEngines.packageManager` with the same
 * major, and the allowed dependency builds in the field the manager reads, unless a file of the
 * plugin holds them.
 */
export const packageManagerFields = ({
  name,
  packageManager,
  builds,
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
      ...allowedBuildsFields(packageManager.allowedBuildsIn, builds),
    },
  }
}
