import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, rename, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'

const CACHE_NAME_LENGTH = 32

/** A cache key: the kind of source, then whatever identifies one fetched version of it. */
export type CacheKey = readonly [kind: string, ...parts: string[]]

/** The cache directory of a key: one directory per source kind, named by a hash of the key. */
const cacheDirectoryOf = (cacheDir: string, [kind, ...parts]: CacheKey): string =>
  join(
    cacheDir,
    kind,
    createHash('sha256').update(JSON.stringify(parts)).digest('hex').slice(0, CACHE_NAME_LENGTH),
  )

/** Fills a fresh directory and moves it into place once it is complete. */
const fillInto = async (
  directory: string,
  fill: (directory: string) => Promise<void>,
): Promise<string> => {
  const scratch = `${directory}.partial-${process.pid}`
  await rm(scratch, { recursive: true, force: true })
  await mkdir(dirname(directory), { recursive: true })
  try {
    await fill(scratch)
    await rename(scratch, directory)
  } catch (error) {
    await rm(scratch, { recursive: true, force: true })
    if (existsSync(directory)) {
      return directory
    }
    throw error
  }
  return directory
}

/**
 * Answers the cache directory of a key, filling it first unless it is cached already: `fill`
 * writes into a fresh directory that moves into place only once it is complete.
 */
export const fillCacheOnce = async (
  cacheDir: string,
  key: CacheKey,
  fill: (directory: string) => Promise<void>,
): Promise<string> => {
  const directory = cacheDirectoryOf(cacheDir, key)
  return existsSync(directory) ? directory : fillInto(directory, fill)
}

/** Fills the cache directory of a key anew, replacing whatever it held. */
export const refillCache = async (
  cacheDir: string,
  key: CacheKey,
  fill: (directory: string) => Promise<void>,
): Promise<string> => {
  const directory = cacheDirectoryOf(cacheDir, key)
  await rm(directory, { recursive: true, force: true })
  return fillInto(directory, fill)
}
