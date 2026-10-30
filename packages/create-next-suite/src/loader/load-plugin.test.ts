import { mkdir, mkdtemp, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { testManifestJson } from '../test-support/test-manifest.ts'
import { writeFiles } from '../test-support/write-files.ts'
import { loadPlugin } from './load-plugin.ts'
import { loadPlugins } from './load-plugins.ts'
import { PluginLoadError } from './plugin-load-error.ts'

let root: string

const loadError = async (folder: string): Promise<PluginLoadError> => {
  const error = await loadPlugin(join(root, folder)).catch((caught: unknown) => caught)
  if (!(error instanceof PluginLoadError)) {
    throw new Error('Expected a PluginLoadError')
  }
  return error
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'next-suite-loader-'))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('loadPlugin', () => {
  it('returns the parsed manifest and the absolute folder', async () => {
    await writeFiles(root, {
      'auth/plugin.json': testManifestJson('auth', {
        files: [{ source: 'files/auth.ts', target: 'lib/auth.ts' }],
      }),
      'auth/files/auth.ts': 'export {}\n',
    })

    const plugin = await loadPlugin(join(root, 'auth'))

    expect(plugin.folder).toBe(join(root, 'auth'))
    expect(plugin.manifest.name).toBe('auth')
    expect(plugin.manifest.files?.[0]?.conflict).toBe('error')
  })

  it('rejects a folder without plugin.json', async () => {
    await mkdir(join(root, 'empty'))

    expect((await loadError('empty')).message).toContain('no plugin.json')
  })

  it('rejects plugin.json that is not JSON', async () => {
    await writeFiles(root, { 'broken/plugin.json': '{ name: ' })

    expect((await loadError('broken')).message).toContain('plugin.json is not valid JSON')
  })

  it('names the invalid fields of an invalid manifest', async () => {
    await writeFiles(root, { 'bad/plugin.json': testManifestJson('bad', { version: 'x' }) })

    expect((await loadError('bad')).message).toMatch(/plugin\.json is invalid[\s\S]*version/)
  })

  it('rejects a plugin whose contract range the contract version does not satisfy', async () => {
    await writeFiles(root, {
      'future/plugin.json': testManifestJson('future', { contract: '^2.0.0' }),
    })

    expect((await loadError('future')).message).toContain('needs plugin contract ^2.0.0')
  })

  it('rejects a file source that leaves the plugin folder', async () => {
    await writeFiles(root, {
      'escape/plugin.json': testManifestJson('escape', {
        files: [{ source: '../secret.txt', target: 'secret.txt' }],
      }),
      'secret.txt': 'secret',
    })

    expect((await loadError('escape')).message).toContain('lies outside the plugin')
  })

  it('rejects a missing file source', async () => {
    await writeFiles(root, {
      'missing/plugin.json': testManifestJson('missing', {
        files: [{ source: 'files/gone.ts', target: 'gone.ts' }],
      }),
    })

    expect((await loadError('missing')).message).toContain('does not exist')
  })

  it('rejects a file source that is a symbolic link', async () => {
    await writeFiles(root, {
      'linked/plugin.json': testManifestJson('linked', {
        files: [{ source: 'files/link.ts', target: 'link.ts' }],
      }),
      'outside.ts': 'export {}\n',
    })
    await mkdir(join(root, 'linked/files'))
    await symlink(join(root, 'outside.ts'), join(root, 'linked/files/link.ts'))

    expect((await loadError('linked')).message).toContain('is not a regular file')
  })

  it('rejects a file source reached through a symbolic link to an outside folder', async () => {
    await writeFiles(root, {
      'tunnel/plugin.json': testManifestJson('tunnel', {
        files: [{ source: 'files/secret.ts', target: 'secret.ts' }],
      }),
      'outside/secret.ts': 'export {}\n',
    })
    await symlink(join(root, 'outside'), join(root, 'tunnel/files'))

    expect((await loadError('tunnel')).message).toContain('lies outside the plugin')
  })

  it('accepts a file source in a folder whose name starts with two dots', async () => {
    await writeFiles(root, {
      'dots/plugin.json': testManifestJson('dots', {
        files: [{ source: '..config/x.ts', target: 'x.ts' }],
      }),
      'dots/..config/x.ts': 'export {}\n',
    })

    expect((await loadPlugin(join(root, 'dots'))).manifest.name).toBe('dots')
  })

  it('reports a source below a file as missing', async () => {
    await writeFiles(root, {
      'nested/plugin.json': testManifestJson('nested', {
        files: [{ source: 'plugin.json/x.ts', target: 'x.ts' }],
      }),
    })

    expect((await loadError('nested')).message).toContain('does not exist')
  })
})

describe('loadPlugins', () => {
  it('loads every plugin folder in a directory, sorted by folder name', async () => {
    await writeFiles(root, {
      'plugins/zod-env/plugin.json': testManifestJson('zod-env'),
      'plugins/auth/plugin.json': testManifestJson('auth'),
      'plugins/notes.txt': 'not a plugin',
    })

    const plugins = await loadPlugins(join(root, 'plugins'))

    expect(plugins.map((plugin) => plugin.manifest.name)).toEqual(['auth', 'zod-env'])
  })

  it('rejects two plugins with the same name', async () => {
    await writeFiles(root, {
      'plugins/one/plugin.json': testManifestJson('auth'),
      'plugins/two/plugin.json': testManifestJson('auth'),
    })

    await expect(loadPlugins(join(root, 'plugins'))).rejects.toThrow('two plugins are named auth')
  })
})
