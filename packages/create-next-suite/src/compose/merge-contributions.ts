import type { ModuleExport, NamedModuleExport } from '../contract/contributions.ts'
import type { ParsedPluginManifest } from '../contract/plugin-manifest.ts'
import type { VersionCatalog } from '../contract/version-catalog.ts'
import { compareNames } from './compare-names.ts'
import { ComposeError } from './compose-error.ts'
import { collect, define, keyValuePairs, unique, uniqueBy } from './merge-entries.ts'
import { type EnvValues, mergeEnv } from './merge-env.ts'
import { assertUniqueExports, mergeModuleExports } from './merge-module-exports.ts'
import { resolveVersion } from './resolve-version.ts'

type Manifests = readonly ParsedPluginManifest[]
type Contributions = NonNullable<ParsedPluginManifest['contributes']>
type FieldValue = NonNullable<NonNullable<Contributions['package']>['fields']>[string]
type Service = NonNullable<NonNullable<Contributions['container']>['services']>[number]
type ReadmeSection = { section: string; text: string }
type RootProvider = { import: string; component: string }

/** The merged contributions of all plugins. */
export type CompositionValues = {
  scripts: Record<string, string>
  fields: Record<string, FieldValue>
  dependencies: Record<string, string>
  devDependencies: Record<string, string>
  env: EnvValues
  layoutMetadata: { key: string; value: string }[]
  allowedBuilds: string[]
  deniedBuilds: string[]
  cssImports: string[]
  prettierPlugins: string[]
  ciChecks: string[]
  agents: { sections: ReadmeSection[] }
  /** Globs of staged files with the commands lint-staged runs on them, in plugin order. */
  lintStaged: { glob: string; commands: string[] }[]
  gitignore: string[]
  readme: { sections: ReadmeSection[] }
  nextConfig: {
    imports: string[]
    options: { key: string; value: string }[]
    exported: string
  }
  rootProviders: { opening: RootProvider[]; closing: string[] }
  instrumentation: {
    register: ModuleExport[]
    onRequestError: NamedModuleExport[]
  }
  instrumentationClient: ModuleExport[]
  bodyEnd: NamedModuleExport[]
  /** Each path's targets are a JSON array, ready for tsconfig.json. */
  tsconfig: { paths: { alias: string; targets: string }[]; include: string[] }
  generatedDirs: string[]
  lint: { ignores: string[] }
  /** The Knip options that have values, such as `entry`, in the order Knip documents them. */
  knip: { key: string; values: string[] }[]
  container: {
    buildArgs: { name: string; description: string }[]
    env: { name: string; value: string }[]
    services: Service[]
  }
  csp: { directive: string; sources: string[] }[]
  health: { name: string; module: string; export: string }[]
  testSetup: string[]
  logRedact: string[]
}

const sortedByName = <Value>(values: ReadonlyMap<string, Value>): Record<string, Value> =>
  Object.fromEntries([...values].sort(([first], [second]) => compareNames(first, second)))

const mergeDependencies = (
  manifests: Manifests,
  catalog: VersionCatalog,
): Pick<CompositionValues, 'dependencies' | 'devDependencies'> => {
  const resolved = (manifest: ParsedPluginManifest, dependencies: Record<string, string> = {}) =>
    Object.entries(dependencies).map(
      ([name, spec]) => [name, resolveVersion(spec, catalog, manifest.name)] as const,
    )
  const dependencies = define(manifests, 'the dependency', (manifest) =>
    resolved(manifest, manifest.dependencies),
  )
  const devDependencies = define(manifests, 'the dev dependency', (manifest) =>
    resolved(manifest, manifest.devDependencies),
  )
  const both = [...dependencies.keys()].find((name) => devDependencies.has(name))
  if (both !== undefined) {
    throw new ComposeError(`"${both}" is both a dependency and a dev dependency`)
  }
  return {
    dependencies: sortedByName(dependencies),
    devDependencies: sortedByName(devDependencies),
  }
}

const mergeBuilds = (
  manifests: Manifests,
): Pick<CompositionValues, 'allowedBuilds' | 'deniedBuilds'> => {
  const allowed = unique(collect(manifests, ({ contributes }) => contributes?.allowedBuilds))
  return {
    allowedBuilds: allowed.sort(compareNames),
    deniedBuilds: unique(collect(manifests, ({ contributes }) => contributes?.deniedBuilds))
      .filter((name) => !allowed.includes(name))
      .sort(compareNames),
  }
}

const mergeNextConfig = (manifests: Manifests): CompositionValues['nextConfig'] => {
  const options = define(manifests, 'the next.config option', ({ contributes }) =>
    contributes?.nextConfig?.options?.map(({ key, value }) => [key, value]),
  )
  const wrappers = collect(manifests, ({ contributes }) => contributes?.nextConfig?.wrappers)
  return {
    imports: unique(
      collect(manifests, ({ contributes }) => [
        ...(contributes?.nextConfig?.imports ?? []),
        ...(contributes?.nextConfig?.wrappers ?? []).map((wrapper) => wrapper.import),
      ]),
    ),
    options: keyValuePairs(options),
    exported: wrappers.reduce((config, { call }) => `${call}(${config})`, 'nextConfig'),
  }
}

const mergeLintStaged = (manifests: Manifests): CompositionValues['lintStaged'] => {
  const entries = collect(manifests, ({ contributes }) => contributes?.lintStaged)
  return unique(entries.map(({ glob }) => glob)).map((glob) => ({
    glob,
    commands: unique(entries.filter((entry) => entry.glob === glob).map(({ command }) => command)),
  }))
}

const mergeRootProviders = (manifests: Manifests): CompositionValues['rootProviders'] => {
  const opening = collect(manifests, ({ contributes }) => contributes?.rootProviders)
  return {
    opening,
    closing: opening.map(({ component }) => component).reverse(),
  }
}

const mergePaths = (manifests: Manifests): CompositionValues['tsconfig']['paths'] =>
  [
    ...define(manifests, 'the tsconfig path', ({ contributes }) =>
      Object.entries(contributes?.tsconfig?.paths ?? {}),
    ),
  ].map(([alias, targets]) => ({ alias, targets: JSON.stringify(targets) }))

const mergeCsp = (manifests: Manifests): CompositionValues['csp'] => {
  const directives = collect(manifests, ({ contributes }) => Object.entries(contributes?.csp ?? {}))
  return unique(directives.map(([directive]) => directive)).map((directive) => ({
    directive,
    sources: unique(
      directives.filter(([name]) => name === directive).flatMap(([, sources]) => sources),
    ),
  }))
}

/**
 * The generated directories, and the patterns that make git, the linter and Knip ignore them on
 * top of what the plugins list.
 */
const mergeGeneratedDirs = (
  manifests: Manifests,
): Pick<CompositionValues, 'generatedDirs' | 'gitignore' | 'lint'> & {
  knipIgnore: string[]
} => {
  const generatedDirs = unique(collect(manifests, ({ contributes }) => contributes?.generatedDirs))
  const globs = generatedDirs.map((directory) => `${directory}/**`)
  return {
    generatedDirs,
    gitignore: unique([
      ...collect(manifests, ({ contributes }) => contributes?.gitignore),
      ...generatedDirs.map((directory) => `/${directory}`),
    ]),
    lint: {
      ignores: unique([
        ...collect(manifests, ({ contributes }) => contributes?.lint?.ignores),
        ...globs,
      ]),
    },
    knipIgnore: unique([
      ...collect(manifests, ({ contributes }) => contributes?.knip?.ignore),
      ...globs,
    ]),
  }
}

const mergeKnip = (manifests: Manifests, ignore: string[]): CompositionValues['knip'] =>
  [
    {
      key: 'entry',
      values: unique(collect(manifests, ({ contributes }) => contributes?.knip?.entry)),
    },
    { key: 'ignore', values: ignore },
    {
      key: 'ignoreDependencies',
      values: unique(
        collect(manifests, ({ contributes }) => contributes?.knip?.ignoreDependencies),
      ),
    },
  ].filter(({ values }) => values.length > 0)

const mergeContainer = (manifests: Manifests): CompositionValues['container'] => ({
  buildArgs: uniqueBy(
    collect(manifests, ({ contributes }) => contributes?.container?.buildArgs),
    ({ name }) => name,
  ),
  env: uniqueBy(
    collect(manifests, ({ contributes }) => contributes?.container?.env),
    ({ name }) => name,
  ),
  services: [
    ...define(manifests, 'the compose service', ({ contributes }) =>
      contributes?.container?.services?.map((service) => [service.name, service]),
    ).values(),
  ],
})

/**
 * Merges the contributions of plugins in their order, by a fixed rule per composition point: lists
 * keep plugin order without duplicates; a named entry, such as a script, a dependency or an
 * environment variable, that two plugins define differently is an error, identical definitions
 * merge.
 */
export const mergeContributions = (
  manifests: Manifests,
  catalog: VersionCatalog,
): CompositionValues => {
  const { knipIgnore, ...generated } = mergeGeneratedDirs(manifests)
  return {
    scripts: Object.fromEntries(
      define(manifests, 'the script', ({ contributes }) =>
        Object.entries(contributes?.package?.scripts ?? {}),
      ),
    ),
    fields: Object.fromEntries(
      define(manifests, 'the package.json field', ({ contributes }) =>
        Object.entries(contributes?.package?.fields ?? {}),
      ),
    ),
    ...mergeDependencies(manifests, catalog),
    env: mergeEnv(manifests),
    layoutMetadata: keyValuePairs(
      define(manifests, 'the layout metadata field', ({ contributes }) =>
        contributes?.layoutMetadata?.map(({ key, value }) => [key, value]),
      ),
    ),
    ...mergeBuilds(manifests),
    cssImports: unique(collect(manifests, ({ contributes }) => contributes?.cssImports)),
    prettierPlugins: unique(collect(manifests, ({ contributes }) => contributes?.prettierPlugins)),
    ciChecks: unique(collect(manifests, ({ contributes }) => contributes?.ciChecks)),
    agents: {
      sections: collect(manifests, ({ contributes }) => contributes?.agents),
    },
    lintStaged: mergeLintStaged(manifests),
    readme: {
      sections: collect(manifests, ({ contributes }) => contributes?.readme),
    },
    nextConfig: mergeNextConfig(manifests),
    rootProviders: mergeRootProviders(manifests),
    instrumentation: {
      register: mergeModuleExports(
        manifests,
        (contributes) => contributes.instrumentation?.register,
      ),
      onRequestError: mergeModuleExports(
        manifests,
        (contributes) => contributes.instrumentation?.onRequestError,
      ),
    },
    instrumentationClient: assertUniqueExports(
      'instrumentation-client.ts',
      mergeModuleExports(manifests, (contributes) => contributes.instrumentationClient),
    ),
    bodyEnd: assertUniqueExports(
      'the end of the body',
      mergeModuleExports(manifests, (contributes) => contributes.bodyEnd),
    ),
    tsconfig: {
      paths: mergePaths(manifests),
      include: unique(collect(manifests, ({ contributes }) => contributes?.tsconfig?.include)),
    },
    ...generated,
    knip: mergeKnip(manifests, knipIgnore),
    container: mergeContainer(manifests),
    csp: mergeCsp(manifests),
    health: uniqueBy(
      collect(manifests, ({ contributes }) => contributes?.health),
      ({ name }) => name,
    ),
    testSetup: unique(collect(manifests, ({ contributes }) => contributes?.testSetup)),
    logRedact: unique(collect(manifests, ({ contributes }) => contributes?.logRedact)),
  }
}
