import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { loadAssets } from './load-assets.ts'

let root: string

const writePlugin = async (path: string, extra: object = {}): Promise<void> => {
  const file = join(root, path, 'plugin.json')
  await mkdir(dirname(file), { recursive: true })
  await writeFile(
    file,
    JSON.stringify({
      name: path.split('/').at(-1),
      version: '1.0.0',
      contract: '^1.0.0',
      title: 'x',
      description: 'x',
      ...extra,
    }),
  )
}

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
})
