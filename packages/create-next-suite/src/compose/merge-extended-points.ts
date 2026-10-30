import type { ParsedPluginManifest } from '../contract/plugin-manifest.ts'
import { ComposeError } from './compose-error.ts'

type Contributions = NonNullable<ParsedPluginManifest['contributes']>
type ModuleExport = { module: string; export?: string | undefined }
type Service = NonNullable<NonNullable<Contributions['container']>['services']>[number]

/** The merged entries of the composition points beyond the basic ones, as templates read them. */
export type ExtendedValues = {
  instrumentation: {
    register: ModuleExport[]
    onRequestError: { module: string; export: string }[]
  }
  instrumentationClient: ModuleExport[]
  bodyEnd: { module: string; export: string }[]
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

const unique = <Value>(values: Value[]): Value[] => [...new Set(values)]
const uniqueBy = <Value>(values: Value[], key: (value: Value) => string): Value[] =>
  values.filter((value, index) => values.findIndex((other) => key(other) === key(value)) === index)

const collect = <Value>(
  manifests: readonly ParsedPluginManifest[],
  pick: (contributes: Contributions) => Value[] | undefined,
): Value[] => manifests.flatMap((manifest) => pick(manifest.contributes ?? {}) ?? [])

const mergePaths = (manifests: readonly ParsedPluginManifest[]) => {
  const paths = new Map<string, { targets: string[]; origin: string }>()
  for (const manifest of manifests) {
    for (const [alias, targets] of Object.entries(manifest.contributes?.tsconfig?.paths ?? {})) {
      const existing = paths.get(alias)
      if (existing !== undefined && JSON.stringify(existing.targets) !== JSON.stringify(targets)) {
        throw new ComposeError(
          `${existing.origin} and ${manifest.name} point the tsconfig path "${alias}" to different targets`,
        )
      }
      paths.set(alias, { targets, origin: manifest.name })
    }
  }
  return [...paths.entries()].map(([alias, { targets }]) => ({
    alias,
    targets: JSON.stringify(targets),
  }))
}

const mergeServices = (manifests: readonly ParsedPluginManifest[]): Service[] => {
  const services = new Map<string, { service: Service; origin: string }>()
  for (const manifest of manifests) {
    for (const service of manifest.contributes?.container?.services ?? []) {
      const existing = services.get(service.name)
      if (existing !== undefined && JSON.stringify(existing.service) !== JSON.stringify(service)) {
        throw new ComposeError(
          `${existing.origin} and ${manifest.name} define the compose service "${service.name}" differently`,
        )
      }
      services.set(service.name, { service, origin: manifest.name })
    }
  }
  return [...services.values()].map(({ service }) => service)
}

const mergeCsp = (manifests: readonly ParsedPluginManifest[]) => {
  const directives = new Map<string, string[]>()
  for (const manifest of manifests) {
    for (const [directive, sources] of Object.entries(manifest.contributes?.csp ?? {})) {
      directives.set(directive, unique([...(directives.get(directive) ?? []), ...sources]))
    }
  }
  return [...directives.entries()].map(([directive, sources]) => ({ directive, sources }))
}

/** Fails when two modules share an export name, which would import the same binding twice. */
const assertUniqueExports = <Entry extends ModuleExport>(
  point: string,
  entries: Entry[],
): Entry[] => {
  const modules = new Map<string, string>()
  for (const { module, export: name } of entries) {
    if (name === undefined) {
      continue
    }
    const existing = modules.get(name)
    if (existing !== undefined && existing !== module) {
      throw new ComposeError(`${existing} and ${module} both export "${name}" for ${point}`)
    }
    modules.set(name, module)
  }
  return entries
}

const moduleKey = ({ module, export: name }: ModuleExport): string => `${module}#${name ?? ''}`

/**
 * Merges the composition points for instrumentation, the end of the body, tsconfig, generated
 * folders, the linter, Knip, the container, the CSP, health checks, test setup and log redaction.
 * Lists keep plugin order without duplicates; a tsconfig path or a compose service defined
 * differently by two plugins fails. Generated folders are ignored by the linter and Knip as well.
 */
export const mergeExtendedPoints = (manifests: readonly ParsedPluginManifest[]): ExtendedValues => {
  const generatedDirs = unique(collect(manifests, (contributes) => contributes.generatedDirs))
  return {
    instrumentation: {
      register: uniqueBy(
        collect(manifests, (contributes) => contributes.instrumentation?.register),
        moduleKey,
      ),
      onRequestError: uniqueBy(
        collect(manifests, (contributes) => contributes.instrumentation?.onRequestError),
        moduleKey,
      ),
    },
    instrumentationClient: assertUniqueExports(
      'instrumentation-client.ts',
      uniqueBy(
        collect(manifests, (contributes) => contributes.instrumentationClient),
        moduleKey,
      ),
    ),
    bodyEnd: assertUniqueExports(
      'the end of the body',
      uniqueBy(
        collect(manifests, (contributes) => contributes.bodyEnd),
        moduleKey,
      ),
    ),
    tsconfig: {
      paths: mergePaths(manifests),
      include: unique(collect(manifests, (contributes) => contributes.tsconfig?.include)),
    },
    generatedDirs,
    lint: {
      ignores: unique([
        ...collect(manifests, (contributes) => contributes.lint?.ignores),
        ...generatedDirs.map((folder) => `${folder}/**`),
      ]),
    },
    knip: [
      {
        key: 'entry',
        values: unique(collect(manifests, (contributes) => contributes.knip?.entry)),
      },
      {
        key: 'ignore',
        values: unique([
          ...collect(manifests, (contributes) => contributes.knip?.ignore),
          ...generatedDirs.map((folder) => `${folder}/**`),
        ]),
      },
      {
        key: 'ignoreDependencies',
        values: unique(collect(manifests, (contributes) => contributes.knip?.ignoreDependencies)),
      },
    ].filter(({ values }) => values.length > 0),
    container: {
      buildArgs: uniqueBy(
        collect(manifests, (contributes) => contributes.container?.buildArgs),
        (argument) => argument.name,
      ),
      env: uniqueBy(
        collect(manifests, (contributes) => contributes.container?.env),
        (variable) => variable.name,
      ),
      services: mergeServices(manifests),
    },
    csp: mergeCsp(manifests),
    health: uniqueBy(
      collect(manifests, (contributes) => contributes.health),
      (check) => check.name,
    ),
    testSetup: unique(collect(manifests, (contributes) => contributes.testSetup)),
    logRedact: unique(collect(manifests, (contributes) => contributes.logRedact)),
  }
}
