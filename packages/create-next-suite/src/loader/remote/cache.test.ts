import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { fillCacheOnce, refillCache } from './cache.ts'

const KEY = ['installed', 'sha256-abc'] as const

let cacheDir: string

beforeEach(async () => {
  cacheDir = await mkdtemp(join(tmpdir(), 'next-suite-cache-'))
})

afterEach(async () => {
  await rm(cacheDir, { recursive: true, force: true })
})

const writeVersion = (version: string) => async (directory: string) => {
  await mkdir(directory)
  await writeFile(join(directory, 'version'), version)
}

describe('refillCache', () => {
  it('keeps the earlier directory in place until the new one is complete', async () => {
    const earlier = await fillCacheOnce(cacheDir, KEY, writeVersion('1'))
    let wasKeptWhileFilling = false

    const refilled = await refillCache(cacheDir, KEY, async (directory) => {
      wasKeptWhileFilling = existsSync(join(earlier, 'version'))
      await writeVersion('2')(directory)
    })

    expect(wasKeptWhileFilling).toBe(true)
    expect(refilled).toBe(earlier)
    expect(await readFile(join(refilled, 'version'), 'utf8')).toBe('2')
  })
})
