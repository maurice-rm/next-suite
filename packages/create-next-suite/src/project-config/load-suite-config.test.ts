import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { writeFiles } from '../test-support/write-files.ts'
import { loadSuiteConfig } from './load-suite-config.ts'

const ENTRIES = {
  configEntry: fileURLToPath(new URL('../config.ts', import.meta.url)),
  pluginEntry: fileURLToPath(new URL('../plugin.ts', import.meta.url)),
}

let root: string

const load = () => loadSuiteConfig(join(root, 'next-suite.config.ts'), ENTRIES)

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'next-suite-config-'))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('loadSuiteConfig', () => {
  it('runs the config with create-next-suite/config, and keeps its text and inline plugins', async () => {
    const text = [
      "import { definePlugin, defineSuiteConfig } from 'create-next-suite/config'",
      '',
      'export default defineSuiteConfig({',
      "  project: { name: 'my-app' },",
      "  plugins: ['pnpm', definePlugin({ name: 'greet', title: 'Greet', files: { 'hi.txt': 'next-suite/hi.txt' } })],",
      '})',
      '',
    ].join('\n')
    await writeFiles(root, {
      'next-suite.config.ts': text,
      'next-suite/hi.txt': 'hi\n',
    })

    const loaded = await load()

    expect(loaded.text).toBe(text)
    expect(loaded.directory).toBe(root)
    expect(loaded.config.project).toEqual({ name: 'my-app' })
    expect(loaded.config.plugins[0]).toBe('pnpm')
    expect(loaded.inlinePlugins.map(({ plugin }) => plugin.name)).toEqual(['greet'])
    expect(loaded.inlinePlugins[0]?.readFile('next-suite/hi.txt')).toBe('hi\n')
  })

  it('fails with the path for a config that is missing', async () => {
    await expect(load()).rejects.toThrow(`cannot read ${join(root, 'next-suite.config.ts')}`)
  })

  it('fails with every problem for a config of the wrong shape', async () => {
    await writeFiles(root, {
      'next-suite.config.ts':
        "export default { project: { name: 1 }, plugins: 'pnpm', extra: 1 }\n",
    })

    await expect(load()).rejects.toThrow(
      new RegExp(`^${join(root, 'next-suite.config.ts')} is invalid\\n`),
    )
  })

  it('fails for a config that does not run', async () => {
    await writeFiles(root, {
      'next-suite.config.ts': 'throw new Error("boom")\n',
    })

    await expect(load()).rejects.toThrow(`${join(root, 'next-suite.config.ts')} does not run`)
  })
})
