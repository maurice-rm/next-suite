import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { writeFiles } from '../test-support/write-files.ts'
import { snapshotPlugin } from './snapshot-plugin.ts'

const PLUGIN_FILES = { 'plugin.ts': 'export default {}\n', 'files/mail.txt': 'mail\n' }

let root: string

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'next-suite-snapshot-'))
  await writeFiles(join(root, 'mail'), PLUGIN_FILES)
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

const snapshot = () =>
  snapshotPlugin(join(root, 'mail'), { cacheDir: join(root, 'cache'), location: './mail' })

describe('snapshotPlugin', () => {
  it('rebuilds a cached snapshot whose files no longer match its content hash', async () => {
    const first = await snapshot()
    await writeFile(join(first.directory, 'plugin.ts'), 'tampered\n')

    const second = await snapshot()

    expect(second).toEqual(first)
    expect(await readFile(join(second.directory, 'plugin.ts'), 'utf8')).toBe('export default {}\n')
  })

  it('rebuilds a cached snapshot that gained installed packages', async () => {
    const first = await snapshot()
    await writeFiles(join(first.directory, 'node_modules/greet'), { 'index.js': 'tampered\n' })

    const second = await snapshot()

    await expect(readFile(join(second.directory, 'node_modules/greet/index.js'))).rejects.toThrow()
  })
})
