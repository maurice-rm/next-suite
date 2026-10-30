import { createHash } from 'node:crypto'
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { dirname, join, relative, sep } from 'node:path'

import { isMissingFileError } from '../file-system/error-code.ts'
import { PluginLoadError } from './plugin-load-error.ts'
import { fillCacheOnce } from './remote/cache.ts'

/** Directories a snapshot leaves out: installed packages, which the core installs itself, and Git. */
const SKIPPED_DIRECTORIES: ReadonlySet<string> = new Set(['node_modules', '.git'])
/** Far above any plugin, small enough that a directory by mistake does not fill the disk. */
const MAX_SNAPSHOT_BYTES = 50 * 1024 * 1024
const HASH_ALGORITHM = 'sha256'
const SNAPSHOT_CACHE = 'snapshot'

/** A file of a plugin by its path inside the plugin's directory, with `/` as separator. */
type PluginFile = { path: string; content: Buffer }

/**
 * A plugin's files, copied into the cache: the directory its code is read and run from, and the
 * content hash of its files, which trust records.
 */
export type PluginSnapshot = { directory: string; contentHash: string }

/**
 * The paths of every regular file below a directory, relative to `root` with `/` as separator,
 * sorted; a link or any other kind of entry fails.
 */
const listPluginFiles = async (root: string, location: string): Promise<string[]> => {
  const entries = await readdir(root, { recursive: true, withFileTypes: true })
  const paths: string[] = []
  for (const entry of entries) {
    const path = relative(root, join(entry.parentPath, entry.name)).split(sep)
    if (path.some((segment) => SKIPPED_DIRECTORIES.has(segment)) || entry.isDirectory()) {
      continue
    }
    if (!entry.isFile()) {
      throw new PluginLoadError(
        location,
        `${path.join('/')} is a link or no regular file; a plugin holds regular files only`,
      )
    }
    paths.push(path.join('/'))
  }
  return paths.sort()
}

/** Reads every file of a plugin, failing as soon as they grow larger than a plugin can be. */
const readPluginFiles = async (root: string, location: string): Promise<PluginFile[]> => {
  const files: PluginFile[] = []
  let size = 0
  for (const path of await listPluginFiles(root, location)) {
    const content = await readFile(join(root, path))
    size += content.byteLength
    if (size > MAX_SNAPSHOT_BYTES) {
      throw new PluginLoadError(location, 'its files are larger than a plugin can be')
    }
    files.push({ path, content })
  }
  return files
}

/** The hash of a plugin's files: each path with the hash of its content, in path order. */
const contentHashOf = (files: readonly PluginFile[]): string => {
  const hash = createHash(HASH_ALGORITHM)
  for (const { path, content } of files) {
    hash.update(`${path}\0${createHash(HASH_ALGORITHM).update(content).digest('hex')}\n`)
  }
  return `${HASH_ALGORITHM}-${hash.digest('hex')}`
}

const assertDirectory = async (directory: string, location: string): Promise<void> => {
  const stats = await stat(directory).catch((error: unknown) => {
    if (isMissingFileError(error)) {
      throw new PluginLoadError(location, `${directory} does not exist`, {
        cause: error,
      })
    }
    throw error
  })
  if (!stats.isDirectory()) {
    throw new PluginLoadError(location, `${directory} is no directory`)
  }
}

/**
 * Copies the files of a plugin's directory into the cache, one directory per content hash, so
 * the plugin is read, trusted and run from files that cannot change in between. `node_modules`
 * and `.git` are left out; a link or any other entry that is no regular file fails, and so does
 * a directory larger than a plugin can be. `location` names the plugin in errors.
 *
 * @throws PluginLoadError for a missing directory, a link or a directory that is too large.
 */
export const snapshotPlugin = async (
  directory: string,
  { cacheDir, location }: { cacheDir: string; location: string },
): Promise<PluginSnapshot> => {
  await assertDirectory(directory, location)
  const files = await readPluginFiles(directory, location)
  const contentHash = contentHashOf(files)
  const snapshot = await fillCacheOnce(cacheDir, [SNAPSHOT_CACHE, contentHash], async (target) => {
    for (const { path, content } of files) {
      await mkdir(dirname(join(target, path)), { recursive: true })
      await writeFile(join(target, path), content)
    }
    await mkdir(target, { recursive: true })
  })
  return { directory: snapshot, contentHash }
}
