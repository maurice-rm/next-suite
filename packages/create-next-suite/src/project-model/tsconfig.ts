import { formatJson } from './format-json.ts'
import { isJsonObject, type JsonObject, type JsonValue, parseJsonObject } from './json-value.ts'
import { ProjectError } from './project-error.ts'

const PATH = 'tsconfig.json'
const BASE_ORIGIN = 'base'
const BASE_ALIAS = '@/*'

/** The `tsconfig.json` of the project: its import alias, `paths` and `include`. */
export type Tsconfig = {
  /** Replaces the base's `@/*` alias with `alias`, pointing at `target`, in its place. */
  setSourceAlias: (alias: string, target: string) => void
  /** Adds a path before the source alias; the same path with other targets is a clash. */
  addPath: (alias: string, targets: readonly string[], origin: string) => void
  /** Adds a pattern to `include` before the base's patterns, for files its globs miss. */
  addInclude: (pattern: string) => void
  print: () => string
}

type PathEntry = { alias: string; targets: readonly string[]; origin: string }

const stringArray = (value: JsonValue | undefined): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []

const objectOf = (value: JsonValue | undefined): JsonObject => (isJsonObject(value) ? value : {})

const basePaths = (compilerOptions: JsonValue | undefined): PathEntry[] =>
  Object.entries(objectOf(objectOf(compilerOptions).paths)).map(([alias, targets]) => ({
    alias,
    targets: stringArray(targets),
    origin: BASE_ORIGIN,
  }))

/**
 * Opens the project's `tsconfig.json`. Paths of the base file count as set by `base`.
 *
 * @throws ProjectError when the text holds no JSON object.
 */
export const openTsconfig = (text: string): Tsconfig => {
  const data = parseJsonObject(text, PATH)
  const paths = basePaths(data.compilerOptions)
  const baseIncludes = stringArray(data.include)
  const addedIncludes: string[] = []
  let sourceAlias = BASE_ALIAS

  const indexOf = (alias: string): number => paths.findIndex((entry) => entry.alias === alias)

  return {
    setSourceAlias: (alias, target) => {
      const index = indexOf(sourceAlias)
      const entry = { alias, targets: [target], origin: paths[index]?.origin ?? BASE_ORIGIN }
      paths.splice(index === -1 ? paths.length : index, index === -1 ? 0 : 1, entry)
      sourceAlias = alias
    },

    addPath: (alias, targets, origin) => {
      const existing = paths[indexOf(alias)]
      if (existing === undefined) {
        const aliasIndex = indexOf(sourceAlias)
        paths.splice(aliasIndex === -1 ? paths.length : aliasIndex, 0, { alias, targets, origin })
        return
      }
      if (JSON.stringify(existing.targets) !== JSON.stringify(targets)) {
        throw new ProjectError(
          `${existing.origin} and ${origin} set the tsconfig path ${alias} to different targets`,
        )
      }
    },

    addInclude: (pattern) => {
      if (!baseIncludes.includes(pattern) && !addedIncludes.includes(pattern)) {
        addedIncludes.push(pattern)
      }
    },

    print: () => {
      const compilerOptions = objectOf(data.compilerOptions)
      const printed: Record<string, JsonValue> = {
        ...data,
        compilerOptions:
          paths.length === 0
            ? compilerOptions
            : {
                ...compilerOptions,
                paths: Object.fromEntries(paths.map(({ alias, targets }) => [alias, targets])),
              },
      }
      if (addedIncludes.length > 0) {
        printed.include = [...addedIncludes, ...baseIncludes]
      }
      return formatJson(printed)
    },
  }
}
