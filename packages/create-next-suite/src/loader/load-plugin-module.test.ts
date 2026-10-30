import { mkdtemp, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { writeFiles } from '../test-support/write-files.ts'
import { loadPluginModule } from './load-plugin-module.ts'

const PLUGIN_ENTRY = fileURLToPath(new URL('../plugin.ts', import.meta.url))

let root: string

const load = (directory: string) => loadPluginModule(join(root, directory), PLUGIN_ENTRY)

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'next-suite-plugin-module-'))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('loadPluginModule', () => {
  it('runs plugin.ts, resolving create-next-suite/plugin, and reads the files of its directory', async () => {
    await writeFiles(root, {
      'acme/plugin.ts': [
        "import { definePlugin } from 'create-next-suite/plugin'",
        'const title: string = "Acme"',
        "export default definePlugin({ name: 'acme', title, files: { 'acme.txt': 'files/acme.txt' } })",
        '',
      ].join('\n'),
      'acme/files/acme.txt': 'acme\n',
    })

    const loaded = await load('acme')

    expect(loaded.plugin).toMatchObject({ name: 'acme', title: 'Acme' })
    expect(loaded.directory).toBe(join(root, 'acme'))
    expect(loaded.readFile('files/acme.txt')).toBe('acme\n')
  })

  it('resolves create-next-suite/points to the entry beside the plugin entry', async () => {
    await writeFiles(root, {
      'blog/plugin.ts': [
        "import { definePlugin } from 'create-next-suite/plugin'",
        "import { orm } from 'create-next-suite/points'",
        "export default definePlugin({ name: 'blog', title: 'Blog', uses: { orm } })",
        '',
      ].join('\n'),
    })

    const loaded = await load('blog')

    expect(loaded.plugin.uses).toEqual({ orm: { kind: 'value', name: 'orm' } })
  })

  it('refuses a directory without plugin.ts', async () => {
    await writeFiles(root, { 'acme/README.md': '' })

    await expect(load('acme')).rejects.toThrow(
      `cannot load the plugin ${join(root, 'acme')}: no plugin.ts`,
    )
  })

  it('refuses a default export that is no plugin', async () => {
    await writeFiles(root, { 'acme/plugin.ts': 'export default { title: "Acme" }\n' })

    await expect(load('acme')).rejects.toThrow(
      'plugin.ts exports no plugin with a name and a title by default',
    )
  })

  it('refuses to read a file outside the plugin, also through a link', async () => {
    await writeFiles(root, {
      'acme/plugin.ts': 'export default { name: "acme", title: "Acme" }\n',
      'secret.txt': 'secret\n',
    })
    await symlink(join(root, 'secret.txt'), join(root, 'acme', 'link.txt'))

    const loaded = await load('acme')

    expect(() => loaded.readFile('../secret.txt')).toThrow('lies outside the plugin')
    expect(() => loaded.readFile('link.txt')).toThrow('is not a regular file')
    expect(() => loaded.readFile('missing.txt')).toThrow('does not exist')
  })
})
