import type { ParsedPluginManifest } from '../contract/plugin-manifest.ts'
import { ComposeError } from './compose-error.ts'

type Manifests = readonly ParsedPluginManifest[]

/** An entry of an ordered map whose value is a single value, such as a script and its command. */
export type KeyValue<Value = string> = { key: string; value: Value }

/** An entry of an ordered map whose value is a list, such as a CSP directive and its sources. */
export type KeyValues = { key: string; values: string[] }

/** A named value with the plugin that defines it. */
type Definition<Value> = { name: string; value: Value; origin: string }

const isSame = (first: unknown, second: unknown): boolean =>
  JSON.stringify(first) === JSON.stringify(second)

/** The entries every manifest contributes to one point, in plugin order. */
export const collect = <Value>(
  manifests: Manifests,
  pick: (manifest: ParsedPluginManifest) => readonly Value[] | undefined,
): Value[] => manifests.flatMap((manifest) => pick(manifest) ?? [])

export const unique = <Value>(values: readonly Value[]): Value[] => [...new Set(values)]

export const uniqueBy = <Value>(values: readonly Value[], key: (value: Value) => string): Value[] =>
  values.filter((value, index) => values.findIndex((other) => key(other) === key(value)) === index)

/**
 * The named entries every manifest contributes to one point, by name in the order they were first
 * defined. Identical definitions of a name merge; two different ones fail, naming `kind`, such as
 * `the script`.
 */
export const define = <Value>(
  manifests: Manifests,
  kind: string,
  pick: (manifest: ParsedPluginManifest) => Iterable<readonly [string, Value]> | undefined,
): Map<string, Value> => {
  const entries = manifests.flatMap((manifest) =>
    [...(pick(manifest) ?? [])].map(([name, value]) => ({ name, value, origin: manifest.name })),
  )
  const definitions = new Map<string, Definition<Value>>()
  for (const entry of entries) {
    const existing = definitions.get(entry.name)
    if (existing === undefined) {
      definitions.set(entry.name, entry)
      continue
    }
    if (!isSame(existing.value, entry.value)) {
      throw new ComposeError(
        `${existing.origin} and ${entry.origin} define ${kind} "${entry.name}" differently`,
      )
    }
  }
  return new Map([...definitions].map(([name, { value }]) => [name, value]))
}

/** The entries of a map as a list that keeps their order. */
export const keyValuePairs = <Value>(values: ReadonlyMap<string, Value>): KeyValue<Value>[] =>
  [...values].map(([key, value]) => ({ key, value }))
