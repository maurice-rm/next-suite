import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { PluginManifest } from 'create-next-suite/plugin'

/**
 * Rewrites the version catalog of the built-in plugins to the newest release of every dependency,
 * so a generated project shows whether it still works with them. The package managers keep their
 * versions: the runner installs exactly those.
 */

type Dependencies = PluginManifest['dependencies']

const PACKAGE_ROOT = fileURLToPath(
  new URL('.', import.meta.resolve('create-next-suite/package.json')),
)
const CATALOG_PATH = join(PACKAGE_ROOT, 'catalog.json')
const BASE_MANIFEST_PATH = join(PACKAGE_ROOT, 'base', 'plugin.json')
const PLUGINS_PATH = join(PACKAGE_ROOT, 'plugins')
const CATALOG_PREFIX = 'catalog:'
const STABLE_VERSION = /^\d+\.\d+\.\d+$/
/** Generated projects install only releases older than a day; a newer one fails the install. */
const MINIMUM_RELEASE_AGE_MS = 24 * 60 * 60 * 1000

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

const findNewestVersion = (packageName: string, publishedBefore: number): string => {
  const output = execFileSync('npm', ['view', packageName, 'time', '--json'], { encoding: 'utf8' })
  const publishTimes = JSON.parse(output) as Record<string, string>
  const [newest] = Object.entries(publishTimes)
    .filter(([version, time]) => STABLE_VERSION.test(version) && Date.parse(time) < publishedBefore)
    .map(([version]) => version)
    .sort((left, right) => compareVersions(right, left))
  if (newest === undefined) {
    throw new Error(`npm lists no stable release of ${packageName} older than a day`)
  }
  return newest
}

const manifests = readManifests()
const packageNames = packageNamesByEntry(manifests)
const packageManagerEntries = packageManagerEntriesOf(manifests)
const publishedBefore = Date.now() - MINIMUM_RELEASE_AGE_MS
const catalog = readJson(CATALOG_PATH) as Record<string, string>
const newestCatalog = Object.fromEntries(
  Object.entries(catalog).map(([entry, version]) => {
    if (packageManagerEntries.has(entry)) {
      return [entry, version]
    }
    const newestVersion = findNewestVersion(packageNames.get(entry) ?? entry, publishedBefore)
    process.stdout.write(`${entry}: ${version} -> ${newestVersion}\n`)
    return [entry, newestVersion]
  }),
)
writeFileSync(CATALOG_PATH, `${JSON.stringify(newestCatalog, null, 2)}\n`)
