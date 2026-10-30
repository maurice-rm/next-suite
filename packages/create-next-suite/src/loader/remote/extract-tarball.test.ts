import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { buffer } from 'node:stream/consumers'
import { createGzip } from 'node:zlib'

import * as tar from 'tar'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { PluginLoadError } from '../plugin-load-error.ts'
import { extractTarball } from './extract-tarball.ts'

const BLOCK = 512
const MEBIBYTE = 1024 * 1024
const BOMB_MEBIBYTES = 300

let root: string

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'next-suite-extract-'))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

/** A gzipped tarball with one file of zeros, small to download and huge once extracted. */
const zipBomb = (mebibytes: number): Promise<Buffer> => {
  const header = new tar.Header({
    path: 'zeros.bin',
    type: 'File',
    size: mebibytes * MEBIBYTE,
    mode: 0o644,
    mtime: new Date(0),
  })
  header.encode()
  const zeros = Buffer.alloc(MEBIBYTE)
  async function* blocks() {
    yield header.block ?? Buffer.alloc(BLOCK)
    for (let written = 0; written < mebibytes; written += 1) {
      yield zeros
    }
    yield Buffer.alloc(2 * BLOCK)
  }
  return buffer(Readable.from(blocks()).pipe(createGzip()))
}

describe('extractTarball', () => {
  it('rejects an archive that extracts to more than a plugin can be, writing nothing', async () => {
    const target = join(root, 'target')

    const extraction = extractTarball(await zipBomb(BOMB_MEBIBYTES), {
      source: 'https://host/bomb.tgz',
      target,
      strip: 0,
    })

    await expect(extraction).rejects.toThrow(PluginLoadError)
    await expect(extraction).rejects.toThrow('larger than a plugin can be')
    expect(await readdir(target)).toEqual([])
  })
})
