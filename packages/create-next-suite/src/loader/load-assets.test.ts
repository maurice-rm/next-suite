import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { PluginManifest } from '../contract/plugin-manifest.ts'
import { ExpectedError } from '../expected-error.ts'
import { testManifestJson } from '../test-support/test-manifest.ts'
import { writeFiles } from '../test-support/write-files.ts'
import { loadAssets } from './load-assets.ts'

let root: string

const writePlugin = (path: string, extra: Partial<PluginManifest> = {}): Promise<void> =>
  writeFiles(root, {
    [join(path, 'plugin.json')]: testManifestJson(basename(path), extra),
  })

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'next-suite-assets-'))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('loadAssets', () => {
  it('loads the plugins of every category folder and of extras/', async () => {
    await writePlugin('plugins/orm/drizzle', { category: 'orm' })
    await writePlugin('plugins/extras/seo')

    const assets = await loadAssets(root)

    expect(assets.plugins.map((plugin) => plugin.manifest.name)).toEqual(['seo', 'drizzle'])
    expect(assets.base).toBeUndefined()
  })

  it('rejects a plugin in the folder of another category', async () => {
    await writePlugin('plugins/styling/drizzle', { category: 'orm' })

    await expect(loadAssets(root)).rejects.toThrow(`it belongs in ${join(root, 'plugins', 'orm')}`)
  })

  it('rejects a plugin without a category outside extras/', async () => {
    await writePlugin('plugins/orm/seo')

    await expect(loadAssets(root)).rejects.toThrow(
      `it belongs in ${join(root, 'plugins', 'extras')}`,
    )
  })

  it('rejects two plugins with one name in different folders', async () => {
    await writePlugin('plugins/orm/seo', { category: 'orm' })
    await writePlugin('plugins/extras/seo')

    await expect(loadAssets(root)).rejects.toThrow('two plugins are named seo')
  })

  it('names an invalid categories.json instead of failing with a raw schema error', async () => {
    await writeFiles(root, { 'categories.json': JSON.stringify([{ section: 'Data' }]) })

    await expect(loadAssets(root)).rejects.toThrow(ExpectedError)
    await expect(loadAssets(root)).rejects.toThrow('categories.json is invalid')
  })
})
