import { hashFileContent, type LockFile } from '../project-config/lock-file.ts'
import type { PlannedExternalPlugin } from './plan-from-config.ts'

/** How many characters of a content hash a warning shows. */
const SHORT_HASH_LENGTH = 'sha256-'.length + 12
/** How many paths a warning lists before it counts the rest. */
const MAX_LISTED_PATHS = 5

const shortHash = (hash: string): string => hash.slice(0, SHORT_HASH_LENGTH)

const listPaths = (paths: readonly string[]): string => {
  const listed = paths.slice(0, MAX_LISTED_PATHS).join(', ')
  const rest = paths.length - MAX_LISTED_PATHS
  return rest > 0 ? `${listed} and ${rest} more` : listed
}

/** The content hash the lock recorded for a plugin, if it is an external or project plugin. */
const lockedHashOf = (lock: LockFile, name: string): string | undefined => {
  const locked = lock.plugins.find((plugin) => plugin.name === name)
  return locked !== undefined && 'contentHash' in locked ? locked.contentHash : undefined
}

/** The external plugins whose content differs from what the lock recorded, with both hashes. */
const changedPlugins = (lock: LockFile, external: readonly PlannedExternalPlugin[]) =>
  external.flatMap((plugin) => {
    const locked = lockedHashOf(lock, plugin.name)
    return locked === undefined || locked === plugin.contentHash ? [] : [{ ...plugin, locked }]
  })

/**
 * Warns about each external or project plugin of the new output whose content changed since the
 * lock recorded it, such as new commits behind its address; whether it runs is for trust to say.
 */
export const warnAboutChangedPlugins = (
  lock: LockFile,
  external: readonly PlannedExternalPlugin[],
): string[] =>
  changedPlugins(lock, external).map(
    ({ name, entry, locked, contentHash }) =>
      `${name} (${entry}) changed since the last generation: its content ${shortHash(locked)} is ${shortHash(contentHash)} now`,
  )

/**
 * Warns about each external plugin the old output ran with other content than the lock recorded:
 * the old output then holds the plugin's changes already, which reach only files you did not change.
 */
export const warnAboutRegeneratedPlugins = (
  lock: LockFile,
  external: readonly PlannedExternalPlugin[],
): string[] =>
  changedPlugins(lock, external).map(
    ({ name, entry, locked, contentHash }) =>
      `the old output ran ${name} (${entry}) as it is now, content ${shortHash(contentHash)}, not as the project was generated with it, content ${shortHash(locked)}: where the plugin changed a file you also changed, that change does not reach your file`,
  )

/**
 * Warns when the old output, generated once more, differs from what the lock recorded, such as
 * after a change of the generator or a plugin: a file you did not change still takes the new
 * output, a file you changed merges against the old output as it is now.
 */
export const warnAboutLockDrift = (lock: LockFile, old: ReadonlyMap<string, string>): string[] => {
  const paths = [...new Set([...Object.keys(lock.files), ...old.keys()])].sort()
  const drift = paths.filter((path) => {
    const content = old.get(path)
    return content === undefined || lock.files[path] !== hashFileContent(content)
  })
  if (drift.length === 0) {
    return []
  }
  return [
    `the old output, generated once more, differs from the lock in ${listPaths(drift)}; files you did not change still take the new output, files you changed merge against the old output as it is now`,
  ]
}
