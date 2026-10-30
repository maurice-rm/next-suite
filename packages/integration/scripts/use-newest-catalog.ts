import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import packageJson from 'create-next-suite/package.json' with { type: 'json' }

/**
 * Rewrites the versions of the built-in plugins to the newest release of every dependency, so a
 * generated project shows whether it still works with them: the `VERSIONS` of each plugin and the
 * dependencies of the base project, all to the same release. The package managers keep their
 * versions: the runner installs exactly those. @types/node stays on the Node.js major of the
 * engines of create-next-suite, which generated projects run on.
 */

const PACKAGE_ROOT = fileURLToPath(
  new URL('.', import.meta.resolve('create-next-suite/package.json')),
)
const PLUGINS_PATH = join(PACKAGE_ROOT, 'plugins')
const BASE_PACKAGE_PATH = join(PACKAGE_ROOT, 'base', 'package.json')
const PACKAGE_MANAGER_CATEGORY = 'package-manager'
/** The versions of a plugin, one `'<package>': '<version>'` entry each. */
const VERSIONS_CONSTANT = /const VERSIONS = \{[^}]*\}/
const VERSION_ENTRY = /('?[@a-z0-9][\w@./-]*'?): '([^']+)'/g
const QUOTE = "'"
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

const updatePlugins = (): void => {
  const categories = readdirSync(PLUGINS_PATH).filter(
    (category) => category !== PACKAGE_MANAGER_CATEGORY,
  )
  for (const category of categories) {
    for (const plugin of readdirSync(join(PLUGINS_PATH, category))) {
      const path = join(PLUGINS_PATH, category, plugin, 'plugin.ts')
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

updatePlugins()
updateBasePackage()
