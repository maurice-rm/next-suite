import { isJsonObject, type JsonObject, type JsonValue, parseJsonObject } from './json-value.ts'
import { ProjectError } from './project-error.ts'

const PATH = 'package.json'
const BASE_ORIGIN = 'base'
const JSON_INDENT = 2
const PACKAGE_MANAGER_FIELD = 'packageManager'
const DEV_ENGINES_FIELD = 'devEngines'

/** The package manager a project runs with; its name is its command. */
type PackageManagerUse = {
  name: string
  /** The exact version, such as `12.16.1`. */
  version: string
  /**
   * What the project asks for when it runs with another version, through
   * `devEngines.packageManager`: `download` the version, `warn` or stop with an `error`.
   */
  whenVersionDiffers: 'download' | 'warn' | 'error'
}

/** The `package.json` of the project; every entry remembers who set it, to name both in a clash. */
export type PackageJson = {
  /** Adds a dependency; the dependencies stay sorted by name. */
  addDependency: (name: string, version: string, origin: string) => void
  /** Adds a devDependency; the devDependencies stay sorted by name. */
  addDevDependency: (name: string, version: string, origin: string) => void
  /** Sets a script; scripts keep the order they were set in. */
  setScript: (name: string, command: string, origin: string) => void
  /** Sets a top-level field such as `engines`. */
  setField: (name: string, value: JsonValue, origin: string) => void
  /** Replaces the base's project name. */
  setName: (name: string) => void
  /**
   * Records the package manager: `packageManager` with the exact version before the scripts, and
   * `devEngines.packageManager` with the same major after the other fields.
   */
  usePackageManager: (packageManager: PackageManagerUse) => void
  /**
   * The version a dependency or devDependency is pinned to.
   *
   * @throws ProjectError when the project has no such dependency.
   */
  versionOf: (name: string) => string
  scripts: () => Readonly<Record<string, string>>
  print: () => string
}

/** A group of string entries such as `dependencies`, and how a clash in it is described. */
type EntryGroup = { field: string; entry: string; difference: string }

const DEPENDENCIES: EntryGroup = {
  field: 'dependencies',
  entry: 'dependency',
  difference: 'versions',
}
const DEV_DEPENDENCIES: EntryGroup = {
  field: 'devDependencies',
  entry: 'devDependency',
  difference: 'versions',
}
const SCRIPTS: EntryGroup = { field: 'scripts', entry: 'script', difference: 'commands' }

const stringEntries = (value: JsonValue | undefined): Record<string, string> =>
  Object.fromEntries(
    Object.entries(isJsonObject(value) ? value : {}).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string',
    ),
  )

/** Moves the field `name` of `data` before the field `next`; without `next` it stays where it is. */
const moveBefore = (data: Record<string, JsonValue>, name: string, next: string): void => {
  const value = data[name]
  if (value === undefined || !(next in data)) {
    return
  }
  const entries = Object.entries(data).filter(([key]) => key !== name)
  const index = entries.findIndex(([key]) => key === next)
  entries.splice(index, 0, [name, value])
  for (const key of Object.keys(data)) {
    delete data[key]
  }
  Object.assign(data, Object.fromEntries(entries))
}

const sortedByName = (entries: Record<string, string>): Record<string, string> =>
  Object.fromEntries(Object.entries(entries).sort(([left], [right]) => (left < right ? -1 : 1)))

/** Each base entry of the groups and every base field, as set by the base. */
const baseOrigins = (data: JsonObject): Map<string, string> => {
  const keys = [DEPENDENCIES, DEV_DEPENDENCIES, SCRIPTS].flatMap(({ field }) =>
    Object.keys(stringEntries(data[field])).map((name) => `${field}.${name}`),
  )
  return new Map([...keys, ...Object.keys(data)].map((key) => [key, BASE_ORIGIN]))
}

/**
 * Opens the project's `package.json`. Entries of the base file count as set by `base`.
 *
 * @throws ProjectError when the text holds no JSON object.
 */
export const openPackageJson = (text: string): PackageJson => {
  const data: Record<string, JsonValue> = { ...parseJsonObject(text, PATH) }
  const origins = baseOrigins(data)

  const setEntry = (group: EntryGroup, entry: { name: string; value: string; origin: string }) => {
    const { field, difference } = group
    const { name, value, origin } = entry
    const entries = stringEntries(data[field])
    const key = `${field}.${name}`
    const existing = entries[name]
    const earlier = origins.get(key)
    if (existing !== undefined && earlier !== undefined) {
      if (existing !== value) {
        throw new ProjectError(
          `${earlier} and ${origin} set the ${group.entry} ${name} to different ${difference} (${existing}, ${value})`,
        )
      }
      return
    }
    origins.set(key, origin)
    const updated = { ...entries, [name]: value }
    data[field] = field === SCRIPTS.field ? updated : sortedByName(updated)
  }

  const setField = (name: string, value: JsonValue, origin: string): void => {
    const earlier = origins.get(name)
    if (earlier === undefined) {
      origins.set(name, origin)
      data[name] = value
      return
    }
    if (JSON.stringify(data[name]) !== JSON.stringify(value)) {
      throw new ProjectError(`${earlier} and ${origin} set the field ${name} to different values`)
    }
  }

  return {
    addDependency: (name, value, origin) => setEntry(DEPENDENCIES, { name, value, origin }),
    addDevDependency: (name, value, origin) => setEntry(DEV_DEPENDENCIES, { name, value, origin }),
    setScript: (name, value, origin) => setEntry(SCRIPTS, { name, value, origin }),

    setField,

    setName: (name) => {
      data.name = name
    },

    usePackageManager: ({ name, version, whenVersionDiffers }) => {
      setField(PACKAGE_MANAGER_FIELD, `${name}@${version}`, name)
      moveBefore(data, PACKAGE_MANAGER_FIELD, SCRIPTS.field)
      setField(
        DEV_ENGINES_FIELD,
        { packageManager: { name, version: `^${version}`, onFail: whenVersionDiffers } },
        name,
      )
    },

    versionOf: (name) => {
      const version =
        stringEntries(data[DEPENDENCIES.field])[name] ??
        stringEntries(data[DEV_DEPENDENCIES.field])[name]
      if (version === undefined) {
        throw new ProjectError(`${PATH} has no dependency ${name}`)
      }
      return version
    },

    scripts: () => stringEntries(data[SCRIPTS.field]),

    print: () => `${JSON.stringify(data, null, JSON_INDENT)}\n`,
  }
}
