import type { ParsedPluginManifest } from '../contract/plugin-manifest.ts'
import { define, uniqueBy } from './merge-entries.ts'

type EnvVariable = NonNullable<ParsedPluginManifest['env']>[number]

/** A variable with its Zod schema as code, for an env schema file. */
type EnvSchemaEntry = { name: string; schema: string }

/** The merged environment variables: by plugin for `.env.example`, by scope for an env schema. */
export type EnvValues = {
  groups: { title: string; variables: EnvVariable[] }[]
  server: EnvSchemaEntry[]
  client: EnvSchemaEntry[]
}

/** The Zod schema of a variable as code: a string, with its default when it has one. */
const envSchemaOf = (variable: EnvVariable): EnvSchemaEntry => ({
  name: variable.name,
  schema:
    variable.default === undefined
      ? 'z.string()'
      : `z.string().default(${JSON.stringify(variable.default)})`,
})

/** Each variable in the group of the first plugin that defines it; a plugin without one has none. */
const groupByPlugin = (manifests: readonly ParsedPluginManifest[]): EnvValues['groups'] => {
  const listed = new Set<string>()
  return manifests.flatMap((manifest) => {
    const variables = uniqueBy(manifest.env ?? [], (variable) => variable.name).filter(
      (variable) => !listed.has(variable.name),
    )
    for (const variable of variables) {
      listed.add(variable.name)
    }
    return variables.length === 0 ? [] : [{ title: manifest.title, variables }]
  })
}

/**
 * Merges the environment variables of plugins. A variable two plugins define differently is an
 * error; identical definitions merge and are listed once.
 */
export const mergeEnv = (manifests: readonly ParsedPluginManifest[]): EnvValues => {
  const variables = define(manifests, 'the environment variable', (manifest) =>
    manifest.env?.map((variable) => [variable.name, variable]),
  )
  const ofScope = (scope: EnvVariable['scope']) =>
    [...variables.values()].filter((variable) => variable.scope === scope).map(envSchemaOf)
  return {
    groups: groupByPlugin(manifests),
    server: ofScope('server'),
    client: ofScope('client'),
  }
}
