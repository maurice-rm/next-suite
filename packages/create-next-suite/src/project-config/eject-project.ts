import { existsSync } from 'node:fs'
import { readdir, rm, writeFile } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'

import { readTextIfPresent } from '../file-system/read-text-if-present.ts'
import { formatJson } from '../project-model/format-json.ts'
import { isJsonObject, type JsonObject, type JsonValue } from '../project-model/json-value.ts'
import { ProjectConfigError } from './project-config-error.ts'
import { CLI_PACKAGE, PROJECT_PATHS } from './project-paths.ts'

const PACKAGE_JSON = 'package.json'
const TSCONFIG = 'tsconfig.json'
const KNIP_CONFIG = 'knip.config.ts'
const DEV_DEPENDENCIES = 'devDependencies'
const INCLUDE = 'include'

/** What eject removed, and what is left for the user to do. */
export type Ejection = { removed: string[]; notes: string[] }

/**
 * A change of a JSON file of the project: the change, which answers nothing when the file needs
 * none, what it removes, and what the user removes when the file is no plain JSON.
 */
type JsonEdit = {
  file: string
  change: (json: JsonObject) => JsonObject | undefined
  removed: string
  remedy: string
}

const JSON_EDITS: readonly JsonEdit[] = [
  {
    file: PACKAGE_JSON,
    change: (json) => {
      const devDependencies = json[DEV_DEPENDENCIES]
      if (!isJsonObject(devDependencies) || !(CLI_PACKAGE in devDependencies)) {
        return undefined
      }
      const { [CLI_PACKAGE]: _removed, ...kept } = devDependencies
      return { ...json, [DEV_DEPENDENCIES]: kept }
    },
    removed: `the devDependency ${CLI_PACKAGE} in ${PACKAGE_JSON}`,
    remedy: `remove the devDependency ${CLI_PACKAGE} yourself`,
  },
  {
    file: TSCONFIG,
    change: (json) => {
      const include = json[INCLUDE]
      if (!Array.isArray(include) || !include.includes(PROJECT_PATHS.registryTypes)) {
        return undefined
      }
      const kept: JsonValue[] = include.filter((pattern) => pattern !== PROJECT_PATHS.registryTypes)
      return { ...json, [INCLUDE]: kept }
    },
    removed: `${PROJECT_PATHS.registryTypes} in the include of ${TSCONFIG}`,
    remedy: `remove ${PROJECT_PATHS.registryTypes} from its include yourself`,
  },
]

const listOwnFiles = async (root: string): Promise<string[]> => {
  const directory = join(root, PROJECT_PATHS.inputDirectory)
  if (!existsSync(directory)) {
    return []
  }
  const entries = await readdir(directory, { recursive: true, withFileTypes: true })
  return entries
    .filter((entry) => !entry.isDirectory())
    .map((entry) => relative(root, join(entry.parentPath, entry.name)).split(sep).join('/'))
    .sort()
}

const parseObject = (text: string): JsonObject | undefined => {
  try {
    const value: unknown = JSON.parse(text)
    return isJsonObject(value) ? value : undefined
  } catch (error) {
    if (error instanceof SyntaxError) {
      return undefined
    }
    throw error
  }
}

/** Applies a JSON edit; a file that is no plain JSON is left to the user with a note. */
const applyJsonEdit = async (root: string, edit: JsonEdit, ejection: Ejection): Promise<void> => {
  const text = await readTextIfPresent(join(root, edit.file))
  if (text === undefined) {
    return
  }
  const json = parseObject(text)
  if (json === undefined) {
    ejection.notes.push(`${edit.file} is no plain JSON; ${edit.remedy}`)
    return
  }
  const changed = edit.change(json)
  if (changed !== undefined) {
    await writeFile(join(root, edit.file), formatJson(changed))
    ejection.removed.push(edit.removed)
  }
}

const noteKnipEntries = async (root: string, ejection: Ejection): Promise<void> => {
  const knipConfig = await readTextIfPresent(join(root, KNIP_CONFIG))
  const inputPattern = `${PROJECT_PATHS.inputDirectory}/**`
  if (knipConfig?.includes(PROJECT_PATHS.config)) {
    ejection.notes.push(
      `${KNIP_CONFIG} still names ${PROJECT_PATHS.config} as an entry; remove it there`,
    )
  }
  if (knipConfig?.includes(inputPattern)) {
    ejection.notes.push(`${KNIP_CONFIG} still skips ${inputPattern} under ignore; remove it there`)
  }
}

/**
 * Turns a next-suite project into a plain Next.js project: removes `next-suite.config.ts`,
 * `.next-suite/` and `next-suite/`, the devDependency on create-next-suite and the registry types
 * in the include of `tsconfig.json`. Overrides are the project's files already, so nothing else
 * changes. Files of the user's own under `next-suite/`, its plugins and overrides, stop it unless
 * `force` is set.
 *
 * @throws ProjectConfigError while `next-suite/` holds files and `force` is not set.
 */
export const ejectProject = async (
  root: string,
  { force }: { force: boolean },
): Promise<Ejection> => {
  const ownFiles = await listOwnFiles(root)
  if (ownFiles.length > 0 && !force) {
    throw new ProjectConfigError(
      [
        `${PROJECT_PATHS.inputDirectory}/ holds files of your own that eject would delete:`,
        ...ownFiles.map((file) => `  ${file}`),
        `move them out of ${PROJECT_PATHS.inputDirectory}/ first, or pass --force to delete them too`,
      ].join('\n'),
    )
  }
  const ejection: Ejection = { removed: [], notes: [] }
  const removals = [
    PROJECT_PATHS.config,
    `${PROJECT_PATHS.generatorDirectory}/`,
    `${PROJECT_PATHS.inputDirectory}/`,
  ]
  for (const path of removals) {
    if (existsSync(join(root, path))) {
      await rm(join(root, path), { recursive: true, force: true })
      ejection.removed.push(path)
    }
  }
  for (const edit of JSON_EDITS) {
    await applyJsonEdit(root, edit, ejection)
  }
  await noteKnipEntries(root, ejection)
  return ejection
}
