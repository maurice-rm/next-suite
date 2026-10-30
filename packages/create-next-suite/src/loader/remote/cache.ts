import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, rename, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import { isMissingFileError } from '../../file-system/error-code.ts'

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

/** Fills a fresh directory beside a cache directory; it is removed again when filling fails. */
const fillScratch = async (
  directory: string,
  fill: (directory: string) => Promise<void>,
): Promise<string> => {
  const scratch = `${directory}.partial-${process.pid}`
  await rm(scratch, { recursive: true, force: true })
  await mkdir(dirname(directory), { recursive: true })
  try {
    await fill(scratch)
    return scratch
  } catch (error) {
    await rm(scratch, { recursive: true, force: true })
    throw error
  }
}

/** Moves a filled directory into place, unless another process put one there first. */
const moveIntoPlace = async (scratch: string, directory: string): Promise<string> => {
  try {
    await rename(scratch, directory)
  } catch (error) {
    await rm(scratch, { recursive: true, force: true })
    if (!existsSync(directory)) {
      throw error
    }
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
  if (existsSync(directory)) {
    return directory
  }
  try {
    return await moveIntoPlace(await fillScratch(directory, fill), directory)
  } catch (error) {
    if (existsSync(directory)) {
      return directory
    }
    throw error
  }
}

/**
 * Fills the cache directory of a key anew and replaces whatever it held only once the new
 * directory is complete, so a run still reading the earlier one keeps it until then.
 */
export const refillCache = async (
  cacheDir: string,
  key: CacheKey,
  fill: (directory: string) => Promise<void>,
): Promise<string> => {
  const directory = cacheDirectoryOf(cacheDir, key)
  const scratch = await fillScratch(directory, fill)
  const stale = `${directory}.stale-${process.pid}`
  await rm(stale, { recursive: true, force: true })
  await rename(directory, stale).catch((error: unknown) => {
    if (!isMissingFileError(error)) {
      throw error
    }
  })
  await moveIntoPlace(scratch, directory)
  await rm(stale, { recursive: true, force: true })
  return directory
}
