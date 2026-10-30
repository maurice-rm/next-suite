import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { listDirectories } from '../file-system/list-directories.ts'
import { stubRemote } from '../test-support/stub-remote.ts'
import { writeFiles } from '../test-support/write-files.ts'
import { fetchExternalPlugin } from './fetch-external-plugin.ts'
import { loadExternalPlugin } from './load-external-plugin.ts'

const PLUGINS = fileURLToPath(new URL('../../plugins', import.meta.url))
const PLUGIN_ENTRY = fileURLToPath(new URL('../plugin.ts', import.meta.url))

let root: string

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'next-suite-load-external-'))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

const fetch = (address: string, cwd = root) =>
  fetchExternalPlugin(address, { cwd, remote: stubRemote(root), registries: {} })

const builtInDirectories = async (): Promise<string[]> => {
  const directories: string[] = []
  for (const group of await listDirectories(PLUGINS)) {
    for (const name of await listDirectories(join(PLUGINS, group))) {
      directories.push(join(PLUGINS, group, name))
    }
  }
  return directories
}

describe('loadExternalPlugin', () => {
  it('runs plugin.ts from its snapshot and reads the files there', async () => {
    await writeFiles(join(root, 'mail'), {
      'plugin.ts': [
        "import { definePlugin } from 'create-next-suite/plugin'",
        "import { greeting } from './greeting.ts'",
        "export default definePlugin({ name: 'mail', title: 'Mail', readme: { Mail: greeting } })",
        '',
      ].join('\n'),
      'greeting.ts': "export const greeting = 'Hello'\n",
      'files/mail.txt': 'mail\n',
    })
    const fetched = await fetch('./mail')

    const loaded = await loadExternalPlugin(fetched, PLUGIN_ENTRY)

    expect(loaded.module.plugin.readme).toEqual({ Mail: 'Hello' })
    expect(loaded.module.readFile('files/mail.txt')).toBe('mail\n')
    expect(loaded).toMatchObject({ address: './mail', resolved: undefined })
  })

  it('refuses a plugin whose exported metadata differs from what was read', async () => {
    await writeFiles(join(root, 'mail'), {
      'plugin.ts': [
        "import { definePlugin } from 'create-next-suite/plugin'",
        "export default definePlugin({ name: 'mail', title: 'Mail' })",
        '',
      ].join('\n'),
    })
    const fetched = await fetch('./mail')
    const shown = {
      ...fetched,
      summary: { ...fetched.summary, metadata: { name: 'mail', title: 'Post' } },
    }

    await expect(loadExternalPlugin(shown, PLUGIN_ENTRY)).rejects.toThrow(
      'the metadata its plugin.ts exports differs from the fixed values written in it',
    )
  })

  it('names the error of a plugin.ts that throws while it runs', async () => {
    await writeFiles(join(root, 'mail'), {
      'plugin.ts': [
        "import { definePlugin } from 'create-next-suite/plugin'",
        "throw new Error('broken on purpose')",
        "export default definePlugin({ name: 'mail', title: 'Mail' })",
        '',
      ].join('\n'),
    })

    const loading = loadExternalPlugin(await fetch('./mail'), PLUGIN_ENTRY)

    await expect(loading).rejects.toThrow(
      'cannot load the plugin ./mail: its plugin.ts does not run',
    )
    await expect(loading).rejects.toHaveProperty('cause.message', 'broken on purpose')
  })

  it('loads every built-in plugin as a local directory, with the metadata read from its file', async () => {
    const directories = await builtInDirectories()

    for (const directory of directories) {
      const fetched = await fetch(directory)
      const loaded = await loadExternalPlugin(fetched, PLUGIN_ENTRY)
      const source = await readFile(join(directory, 'plugin.ts'), 'utf8')

      expect(loaded.module.plugin.name, directory).toBe(fetched.summary.metadata.name)
      expect(source).toContain(`name: '${fetched.summary.metadata.name}'`)
    }
    expect(directories.length).toBeGreaterThan(10)
  })
})
