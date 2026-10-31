import { isDeepStrictEqual } from 'node:util'

import { isJsonObject, type JsonObject, type JsonValue } from '../project-model/json-value.ts'

/** A key both sides changed differently, by its path such as `scripts.dev`, with both values. */
export type KeyMergeConflict = {
  path: string
  /** Your value, which the merge keeps; nothing where you removed the key. */
  ours: JsonValue | undefined
  /** next-suite's value; nothing where it no longer writes the key. */
  theirs: JsonValue | undefined
}

/** A merged JSON value and the keys both sides changed differently. */
export type JsonMerge = {
  value: JsonValue | undefined
  conflicts: KeyMergeConflict[]
}

type Sides = {
  base: JsonValue | undefined
  ours: JsonValue | undefined
  theirs: JsonValue | undefined
}

const isSorted = (keys: readonly string[]): boolean =>
  keys.every((key, index) => index === 0 || (keys[index - 1] ?? '') <= key)

/** Our keys in our order, then those only theirs has; sorted when both sides were sorted. */
const mergedKeys = (ours: JsonObject, theirs: JsonObject): string[] => {
  const keys = [...new Set([...Object.keys(ours), ...Object.keys(theirs)])]
  return isSorted(Object.keys(ours)) && isSorted(Object.keys(theirs)) ? keys.sort() : keys
}

const pathOf = (parent: string, key: string): string => (parent === '' ? key : `${parent}.${key}`)

const mergeObjects = (
  path: string,
  { base, ours, theirs }: { base: JsonObject; ours: JsonObject; theirs: JsonObject },
): JsonMerge => {
  const value: Record<string, JsonValue> = {}
  const conflicts: KeyMergeConflict[] = []
  for (const key of mergedKeys(ours, theirs)) {
    const merged = mergeValues(pathOf(path, key), {
      base: base[key],
      ours: ours[key],
      theirs: theirs[key],
    })
    if (merged.value !== undefined) {
      value[key] = merged.value
    }
    conflicts.push(...merged.conflicts)
  }
  return { value, conflicts }
}

const mergeValues = (path: string, { base, ours, theirs }: Sides): JsonMerge => {
  if (isDeepStrictEqual(ours, theirs) || isDeepStrictEqual(base, theirs)) {
    return { value: ours, conflicts: [] }
  }
  if (isDeepStrictEqual(base, ours)) {
    return { value: theirs, conflicts: [] }
  }
  if (isJsonObject(ours) && isJsonObject(theirs)) {
    return mergeObjects(path, {
      base: isJsonObject(base) ? base : {},
      ours,
      theirs,
    })
  }
  return { value: ours, conflicts: [{ path, ours, theirs }] }
}

/**
 * A three-way merge of JSON by key, such as for package.json: a key one side changed takes that
 * side's value, an array counts as one value, and a key both sides changed differently keeps your
 * value and is reported with both. Without a base, as for a file both sides added, every key both
 * sides hold differently is a conflict.
 */
export const mergeJson = (sides: {
  base: JsonValue | undefined
  ours: JsonValue
  theirs: JsonValue
}): JsonMerge => mergeValues('', sides)
