import type { ParsedPluginManifest } from '../contract/plugin-manifest.ts'
import type { VersionCatalog } from '../contract/version-catalog.ts'
import { compareNames } from './compare-names.ts'
import { ComposeError } from './compose-error.ts'

const CATALOG_PREFIX = 'catalog:'

type EnvVariable = NonNullable<ParsedPluginManifest['env']>[number]
type PackageFields = NonNullable<
  NonNullable<NonNullable<ParsedPluginManifest['contributes']>['package']>['fields']
>
type FieldValue = PackageFields[string]
type ReadmeSection = { section: string; text: string }
type RootProvider = { import: string; component: string }

/** The merged contributions of all plugins, as the templates of shared files read them. */
export type CompositionValues = {
  scripts: Record<string, string>
  fields: Record<string, FieldValue>
  dependencies: Record<string, string>
  devDependencies: Record<string, string>
  env: {
    groups: { title: string; variables: EnvVariable[] }[]
    /** The variables by scope, each with its Zod schema as code, for an env schema file. */
    server: EnvSchemaEntry[]
    client: EnvSchemaEntry[]
  }
  layoutMetadata: { key: string; value: string }[]
  allowedBuilds: string[]
  deniedBuilds: string[]
  cssImports: string[]
  prettierPlugins: string[]
  /** Globs of staged files with the commands lint-staged runs on them, in plugin order. */
  lintStaged: { glob: string; commands: string[] }[]
  gitignore: string[]
  readme: { sections: ReadmeSection[] }
  nextConfig: { imports: string[]; options: { key: string; value: string }[]; exported: string }
  rootProviders: { opening: RootProvider[]; closing: string[] }
}

type EnvSchemaEntry = { name: string; schema: string }

type Definition<Value> = { name: string; value: Value; origin: string }

/** Named definitions where a second, different definition of a name is an error. */
type Definitions<Value> = Map<string, Definition<Value>>

type Accumulator = {
  scripts: Definitions<string>
  fields: Definitions<FieldValue>
  dependencies: Definitions<string>
  devDependencies: Definitions<string>
  envVariables: Definitions<EnvVariable>
  nextConfigOptions: Definitions<string>
  layoutMetadata: Definitions<string>
  envGroups: CompositionValues['env']['groups']
  allowedBuilds: string[]
  deniedBuilds: string[]
  cssImports: string[]
  prettierPlugins: string[]
  lintStaged: { glob: string; commands: string[] }[]
  gitignore: string[]
  imports: string[]
  wrapperCalls: string[]
  readme: ReadmeSection[]
  providers: RootProvider[]
}

const createAccumulator = (): Accumulator => ({
  scripts: new Map(),
  fields: new Map(),
  dependencies: new Map(),
  devDependencies: new Map(),
  envVariables: new Map(),
  nextConfigOptions: new Map(),
  layoutMetadata: new Map(),
  envGroups: [],
  allowedBuilds: [],
  deniedBuilds: [],
  cssImports: [],
  prettierPlugins: [],
  lintStaged: [],
  gitignore: [],
  imports: [],
  wrapperCalls: [],
  readme: [],
  providers: [],
})

const isSame = (first: unknown, second: unknown): boolean =>
  JSON.stringify(first) === JSON.stringify(second)

const define = <Value>(
  definitions: Definitions<Value>,
  definition: Definition<Value>,
  kind: string,
): void => {
  const existing = definitions.get(definition.name)
  if (existing === undefined) {
    definitions.set(definition.name, definition)
    return
  }
  if (!isSame(existing.value, definition.value)) {
    throw new ComposeError(
      `${existing.origin} and ${definition.origin} define ${kind} "${definition.name}" differently`,
    )
  }
}

const valuesOf = <Value>(definitions: Definitions<Value>): Record<string, Value> =>
  Object.fromEntries(
    [...definitions.values()].map((definition) => [definition.name, definition.value]),
  )

const sortedValuesOf = <Value>(definitions: Definitions<Value>): Record<string, Value> =>
  Object.fromEntries(
    Object.entries(valuesOf(definitions)).sort(([first], [second]) => compareNames(first, second)),
  )

/** Resolves a `catalog:<name>` version from the catalog; any other version stays as it is. */
export const resolveVersion = (spec: string, catalog: VersionCatalog, origin: string): string => {
  if (!spec.startsWith(CATALOG_PREFIX)) {
    return spec
  }
  const version = catalog[spec.slice(CATALOG_PREFIX.length)]
  if (version === undefined) {
    throw new ComposeError(`${origin} asks for ${spec}, which the version catalog does not list`)
  }
  return version
}

const addPackage = (
  accumulator: Accumulator,
  manifest: ParsedPluginManifest,
  catalog: VersionCatalog,
): void => {
  const origin = manifest.name
  const contribution = manifest.contributes?.package
  for (const [name, value] of Object.entries(contribution?.scripts ?? {})) {
    define(accumulator.scripts, { name, value, origin }, 'the script')
  }
  for (const [name, value] of Object.entries(contribution?.fields ?? {})) {
    define(accumulator.fields, { name, value, origin }, 'the package.json field')
  }
  for (const [name, spec] of Object.entries(manifest.dependencies ?? {})) {
    define(
      accumulator.dependencies,
      { name, value: resolveVersion(spec, catalog, origin), origin },
      'the dependency',
    )
  }
  for (const [name, spec] of Object.entries(manifest.devDependencies ?? {})) {
    const value = resolveVersion(spec, catalog, origin)
    define(accumulator.devDependencies, { name, value, origin }, 'the dev dependency')
  }
}

const addEnv = (accumulator: Accumulator, manifest: ParsedPluginManifest): void => {
  const variables: EnvVariable[] = []
  for (const variable of manifest.env ?? []) {
    const isNew = !accumulator.envVariables.has(variable.name)
    define(
      accumulator.envVariables,
      { name: variable.name, value: variable, origin: manifest.name },
      'the environment variable',
    )
    if (isNew) {
      variables.push(variable)
    }
  }
  if (variables.length > 0) {
    accumulator.envGroups.push({ title: manifest.title, variables })
  }
}

const addNextConfig = (accumulator: Accumulator, manifest: ParsedPluginManifest): void => {
  const contribution = manifest.contributes?.nextConfig
  for (const option of contribution?.options ?? []) {
    define(
      accumulator.nextConfigOptions,
      { name: option.key, value: option.value, origin: manifest.name },
      'the next.config option',
    )
  }
  accumulator.imports.push(...(contribution?.imports ?? []))
  for (const wrapper of contribution?.wrappers ?? []) {
    accumulator.imports.push(wrapper.import)
    accumulator.wrapperCalls.push(wrapper.call)
  }
}

const addLayoutMetadata = (accumulator: Accumulator, manifest: ParsedPluginManifest): void => {
  for (const field of manifest.contributes?.layoutMetadata ?? []) {
    define(
      accumulator.layoutMetadata,
      { name: field.key, value: field.value, origin: manifest.name },
      'the layout metadata field',
    )
  }
}

/** The Zod schema of a variable as code: a string, with its default when it has one. */
const envSchemaOf = (variable: EnvVariable): EnvSchemaEntry => ({
  name: variable.name,
  schema:
    variable.default === undefined
      ? 'z.string()'
      : `z.string().default(${JSON.stringify(variable.default)})`,
})

const envOfScope = (accumulator: Accumulator, scope: EnvVariable['scope']): EnvSchemaEntry[] =>
  [...accumulator.envVariables.values()]
    .map((definition) => definition.value)
    .filter((variable) => variable.scope === scope)
    .map(envSchemaOf)

const addLists = (accumulator: Accumulator, manifest: ParsedPluginManifest): void => {
  accumulator.allowedBuilds.push(...(manifest.contributes?.allowedBuilds ?? []))
  accumulator.deniedBuilds.push(...(manifest.contributes?.deniedBuilds ?? []))
  accumulator.cssImports.push(...(manifest.contributes?.cssImports ?? []))
  accumulator.prettierPlugins.push(...(manifest.contributes?.prettierPlugins ?? []))
  for (const { glob, command } of manifest.contributes?.lintStaged ?? []) {
    const entry = accumulator.lintStaged.find((existing) => existing.glob === glob)
    if (entry === undefined) {
      accumulator.lintStaged.push({ glob, commands: [command] })
    } else if (!entry.commands.includes(command)) {
      entry.commands.push(command)
    }
  }
  accumulator.gitignore.push(...(manifest.contributes?.gitignore ?? []))
  accumulator.readme.push(...(manifest.contributes?.readme ?? []))
  accumulator.providers.push(...(manifest.contributes?.rootProviders ?? []))
}

const assertNoDoubleDependencies = (accumulator: Accumulator): void => {
  for (const name of accumulator.dependencies.keys()) {
    if (accumulator.devDependencies.has(name)) {
      throw new ComposeError(`"${name}" is both a dependency and a dev dependency`)
    }
  }
}

const unique = (values: string[]): string[] => [...new Set(values)]

const toValues = (accumulator: Accumulator): CompositionValues => ({
  scripts: valuesOf(accumulator.scripts),
  fields: valuesOf(accumulator.fields),
  dependencies: sortedValuesOf(accumulator.dependencies),
  devDependencies: sortedValuesOf(accumulator.devDependencies),
  env: {
    groups: accumulator.envGroups,
    server: envOfScope(accumulator, 'server'),
    client: envOfScope(accumulator, 'client'),
  },
  layoutMetadata: [...accumulator.layoutMetadata.values()].map(({ name, value }) => ({
    key: name,
    value,
  })),
  allowedBuilds: unique(accumulator.allowedBuilds).sort(compareNames),
  deniedBuilds: unique(accumulator.deniedBuilds)
    .filter((name) => !accumulator.allowedBuilds.includes(name))
    .sort(compareNames),
  cssImports: unique(accumulator.cssImports),
  prettierPlugins: unique(accumulator.prettierPlugins),
  lintStaged: accumulator.lintStaged,
  gitignore: unique(accumulator.gitignore),
  readme: { sections: accumulator.readme },
  nextConfig: {
    imports: unique(accumulator.imports),
    options: [...accumulator.nextConfigOptions.values()].map(({ name, value }) => ({
      key: name,
      value,
    })),
    exported: accumulator.wrapperCalls.reduce((config, call) => `${call}(${config})`, 'nextConfig'),
  },
  rootProviders: {
    opening: accumulator.providers,
    closing: accumulator.providers.map((provider) => provider.component).reverse(),
  },
})

/**
 * Merges the contributions of plugins in their order. A script, package field, dependency,
 * environment variable or next.config option that two plugins define differently is an error;
 * identical definitions merge.
 */
export const mergeContributions = (
  manifests: readonly ParsedPluginManifest[],
  catalog: VersionCatalog,
): CompositionValues => {
  const accumulator = createAccumulator()
  for (const manifest of manifests) {
    addPackage(accumulator, manifest, catalog)
    addEnv(accumulator, manifest)
    addNextConfig(accumulator, manifest)
    addLayoutMetadata(accumulator, manifest)
    addLists(accumulator, manifest)
  }
  assertNoDoubleDependencies(accumulator)
  return toValues(accumulator)
}
