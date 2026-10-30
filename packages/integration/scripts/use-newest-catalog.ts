import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import packageJson from 'create-next-suite/package.json' with { type: 'json' }
import type { PluginManifest } from 'create-next-suite/plugin'

/**
 * Rewrites the versions of the built-in plugins to the newest release of every dependency, so a
 * generated project shows whether it still works with them: the version catalog, the `VERSIONS`
 * of each plugin written as plugin.ts and the dependencies of the base project, all to the same
 * release. The package managers keep their versions: the runner installs exactly those.
 * @types/node stays on the Node.js major of the engines of create-next-suite, which generated
 * projects run on.
 */

type Dependencies = PluginManifest['dependencies']

const PACKAGE_ROOT = fileURLToPath(
  new URL('.', import.meta.resolve('create-next-suite/package.json')),
)
const CATALOG_PATH = join(PACKAGE_ROOT, 'catalog.json')
const BASE_MANIFEST_PATH = join(PACKAGE_ROOT, 'base', 'plugin.json')
const PLUGINS_PATH = join(PACKAGE_ROOT, 'plugins')
const PLUGIN_MODULES_PATH = join(PACKAGE_ROOT, 'plugins-v2')
const BASE_PACKAGE_PATH = join(PACKAGE_ROOT, 'base-project', 'package.json')
const PACKAGE_MANAGER_CATEGORY = 'package-manager'
/** The versions of a plugin written as plugin.ts, one `'<package>': '<version>'` entry each. */
const VERSIONS_CONSTANT = /const VERSIONS = \{[^}]*\}/
const VERSION_ENTRY = /('?[@a-z0-9][\w@./-]*'?): '([^']+)'/g
const QUOTE = "'"
const CATALOG_PREFIX = 'catalog:'
const STABLE_VERSION = /^\d+\.\d+\.\d+$/
/** Generated projects install only releases older than a day; a newer one fails the install. */
const MINIMUM_RELEASE_AGE_MS = 24 * 60 * 60 * 1000
const NODE_TYPES_PACKAGE = '@types/node'
const LOWEST_MAJOR = /^>=\s*(\d+)/

const nodeMajorOf = (engines: string): string => {
  const major = LOWEST_MAJOR.exec(engines)?.[1]
  if (major === undefined) {
    throw new Error(`cannot read the Node.js major of the engines range ${engines}`)
  }
  return major
}

const NODE_MAJOR = nodeMajorOf(packageJson.engines.node)

const readJson = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8'))

const readManifests = (): PluginManifest[] => {
  const pluginPaths = readdirSync(PLUGINS_PATH).flatMap((category) =>
    readdirSync(join(PLUGINS_PATH, category)).map((plugin) =>
      join(PLUGINS_PATH, category, plugin, 'plugin.json'),
    ),
  )
  return [BASE_MANIFEST_PATH, ...pluginPaths].map((path) => readJson(path) as PluginManifest)
}

const catalogEntriesOf = (dependencies: Dependencies = {}): [string, string][] =>
  Object.entries(dependencies).flatMap(([packageName, version]) =>
    version.startsWith(CATALOG_PREFIX) ? [[version.slice(CATALOG_PREFIX.length), packageName]] : [],
  )

/**
 * The package name behind each catalog entry a plugin depends on, such as `@types/node` for
 * `types-node`.
 */
const packageNamesByEntry = (manifests: PluginManifest[]): Map<string, string> =>
  new Map(
    manifests.flatMap((manifest) => [
      ...catalogEntriesOf(manifest.dependencies),
      ...catalogEntriesOf(manifest.devDependencies),
      ...(manifest.conditionalDependencies ?? []).flatMap((conditional) => [
        ...catalogEntriesOf(conditional.dependencies),
        ...catalogEntriesOf(conditional.devDependencies),
      ]),
    ]),
  )

const packageManagerEntriesOf = (manifests: PluginManifest[]): Set<string> =>
  new Set(
    manifests.flatMap(({ packageManager }) =>
      packageManager?.version.startsWith(CATALOG_PREFIX)
        ? [packageManager.version.slice(CATALOG_PREFIX.length)]
        : [],
    ),
  )

const compareVersions = (left: string, right: string): number => {
  const leftParts = left.split('.').map(Number)
  const rightParts = right.split('.').map(Number)
  const index = leftParts.findIndex((part, position) => part !== rightParts[position])
  return index === -1 ? 0 : (leftParts[index] ?? 0) - (rightParts[index] ?? 0)
}

const isAllowedVersion = (packageName: string, version: string): boolean =>
  STABLE_VERSION.test(version) &&
  (packageName !== NODE_TYPES_PACKAGE || version.startsWith(`${NODE_MAJOR}.`))

const findNewestVersion = (packageName: string, publishedBefore: number): string => {
  const output = execFileSync('npm', ['view', packageName, 'time', '--json'], { encoding: 'utf8' })
  const publishTimes = JSON.parse(output) as Record<string, string>
  const [newest] = Object.entries(publishTimes)
    .filter(
      ([version, time]) =>
        isAllowedVersion(packageName, version) && Date.parse(time) < publishedBefore,
    )
    .map(([version]) => version)
    .sort((left, right) => compareVersions(right, left))
  if (newest === undefined) {
    throw new Error(`npm lists no allowed stable release of ${packageName} older than a day`)
  }
  return newest
}

const publishedBefore = Date.now() - MINIMUM_RELEASE_AGE_MS
const newestVersions = new Map<string, string>()

/** The newest allowed release of a package, looked up once for every place that names it. */
const newestVersionOf = (packageName: string, version: string): string => {
  const known = newestVersions.get(packageName)
  if (known !== undefined) {
    return known
  }
  const newestVersion = findNewestVersion(packageName, publishedBefore)
  newestVersions.set(packageName, newestVersion)
  process.stdout.write(`${packageName}: ${version} -> ${newestVersion}\n`)
  return newestVersion
}

const updateCatalog = (): void => {
  const manifests = readManifests()
  const packageNames = packageNamesByEntry(manifests)
  const packageManagerEntries = packageManagerEntriesOf(manifests)
  const catalog = readJson(CATALOG_PATH) as Record<string, string>
  const newestCatalog = Object.fromEntries(
    Object.entries(catalog).map(([entry, version]) =>
      packageManagerEntries.has(entry)
        ? [entry, version]
        : [entry, newestVersionOf(packageNames.get(entry) ?? entry, version)],
    ),
  )
  writeFileSync(CATALOG_PATH, `${JSON.stringify(newestCatalog, null, 2)}\n`)
}

const updatePluginModules = (): void => {
  const categories = readdirSync(PLUGIN_MODULES_PATH).filter(
    (category) => category !== PACKAGE_MANAGER_CATEGORY,
  )
  for (const category of categories) {
    for (const plugin of readdirSync(join(PLUGIN_MODULES_PATH, category))) {
      const path = join(PLUGIN_MODULES_PATH, category, plugin, 'plugin.ts')
      const source = readFileSync(path, 'utf8')
      const updated = source.replace(VERSIONS_CONSTANT, (constant) =>
        constant.replaceAll(
          VERSION_ENTRY,
          (_entry, key: string, version: string) =>
            `${key}: '${newestVersionOf(key.replaceAll(QUOTE, ''), version)}'`,
        ),
      )
      writeFileSync(path, updated)
    }
  }
}

const newestDependencies = (dependencies: Record<string, string> = {}): Record<string, string> =>
  Object.fromEntries(
    Object.entries(dependencies).map(([packageName, version]) => [
      packageName,
      newestVersionOf(packageName, version),
    ]),
  )

const updateBasePackage = (): void => {
  const basePackage = readJson(BASE_PACKAGE_PATH) as Record<string, unknown> & {
    dependencies?: Record<string, string>
    devDependencies?: Record<string, string>
  }
  const updated = {
    ...basePackage,
    dependencies: newestDependencies(basePackage.dependencies),
    devDependencies: newestDependencies(basePackage.devDependencies),
  }
  writeFileSync(BASE_PACKAGE_PATH, `${JSON.stringify(updated, null, 2)}\n`)
}

updateCatalog()
updatePluginModules()
updateBasePackage()
