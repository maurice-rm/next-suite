import { createHash } from 'node:crypto'
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { dirname, join, relative, sep } from 'node:path'

import { isMissingFileError } from '../file-system/error-code.ts'
import { PluginLoadError } from './plugin-load-error.ts'
import { fillCacheOnce, refillCache } from './remote/cache.ts'

/** Directories a snapshot leaves out: installed packages, which the core installs itself, and Git. */
const SKIPPED_DIRECTORIES: ReadonlySet<string> = new Set(['node_modules', '.git'])
/** A snapshot is checked whole: whatever it holds beyond the plugin's files changes its hash. */
const NOTHING_SKIPPED: ReadonlySet<string> = new Set()
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

/** Where a plugin's files are read from, the directories left out, and its name in errors. */
type FileSource = { root: string; skipped: ReadonlySet<string>; location: string }

/**
 * The paths of every regular file below a directory outside the skipped directories, relative to
 * `root` with `/` as separator, sorted; a link or any other kind of entry fails.
 */
const listPluginFiles = async ({ root, skipped, location }: FileSource): Promise<string[]> => {
  const entries = await readdir(root, { recursive: true, withFileTypes: true })
  const paths: string[] = []
  for (const entry of entries) {
    const path = relative(root, join(entry.parentPath, entry.name)).split(sep)
    if (path.some((segment) => skipped.has(segment)) || entry.isDirectory()) {
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
const readPluginFiles = async (source: FileSource): Promise<PluginFile[]> => {
  const files: PluginFile[] = []
  let size = 0
  for (const path of await listPluginFiles(source)) {
    const content = await readFile(join(source.root, path))
    size += content.byteLength
    if (size > MAX_SNAPSHOT_BYTES) {
      throw new PluginLoadError(source.location, 'its files are larger than a plugin can be')
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

/** Whether a snapshot in the cache holds exactly the files of its content hash, and nothing else. */
const isIntact = async (snapshot: PluginSnapshot, location: string): Promise<boolean> => {
  try {
    const files = await readPluginFiles({
      root: snapshot.directory,
      skipped: NOTHING_SKIPPED,
      location,
    })
    return contentHashOf(files) === snapshot.contentHash
  } catch (error) {
    if (error instanceof PluginLoadError) {
      return false
    }
    throw error
  }
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
 * a directory larger than a plugin can be. A cached snapshot is hashed again before it is used,
 * and written anew when its files differ from its content hash. `location` names the plugin in
 * errors.
 *
 * @throws PluginLoadError for a missing directory, a link, a directory that is too large, or a
 * snapshot that differs from its content hash even after it was written anew.
 */
export const snapshotPlugin = async (
  directory: string,
  { cacheDir, location }: { cacheDir: string; location: string },
): Promise<PluginSnapshot> => {
  await assertDirectory(directory, location)
  const files = await readPluginFiles({ root: directory, skipped: SKIPPED_DIRECTORIES, location })
  const contentHash = contentHashOf(files)
  const key = [SNAPSHOT_CACHE, contentHash] as const
  const write = async (target: string) => {
    for (const { path, content } of files) {
      await mkdir(dirname(join(target, path)), { recursive: true })
      await writeFile(join(target, path), content)
    }
    await mkdir(target, { recursive: true })
  }
  const cached = { directory: await fillCacheOnce(cacheDir, key, write), contentHash }
  if (await isIntact(cached, location)) {
    return cached
  }
  const rewritten = { directory: await refillCache(cacheDir, key, write), contentHash }
  if (!(await isIntact(rewritten, location))) {
    throw new PluginLoadError(location, `its snapshot ${rewritten.directory} keeps changing`)
  }
  return rewritten
}
