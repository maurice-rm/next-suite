import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { writeFiles } from '../test-support/write-files.ts'
import { loadGroupedPluginModules } from './load-grouped-plugin-modules.ts'

const PLUGIN_ENTRY = fileURLToPath(new URL('../plugin.ts', import.meta.url))

const pluginModule = (name: string, category?: string): string =>
  `export default ${JSON.stringify({ name, title: name, category })}\n`

let root: string

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'next-suite-plugin-modules-'))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('loadGroupedPluginModules', () => {
  it('loads one directory per category and the extras, sorted by directory', async () => {
    await writeFiles(root, {
      'package-manager/pnpm/plugin.ts': pluginModule('pnpm', 'package-manager'),
      'package-manager/npm/plugin.ts': pluginModule('npm', 'package-manager'),
      'extras/sentry/plugin.ts': pluginModule('sentry'),
    })

    const plugins = await loadGroupedPluginModules(root, PLUGIN_ENTRY)

    expect(plugins.map(({ plugin }) => plugin.name)).toEqual(['sentry', 'npm', 'pnpm'])
  })

  it('refuses a plugin in the directory of another category', async () => {
    await writeFiles(root, { 'linter/pnpm/plugin.ts': pluginModule('pnpm', 'package-manager') })

    await expect(loadGroupedPluginModules(root, PLUGIN_ENTRY)).rejects.toThrow(
      `it belongs in ${join(root, 'package-manager')}`,
    )
  })

  it('refuses two plugins of one name', async () => {
    await writeFiles(root, {
      'extras/one/plugin.ts': pluginModule('same'),
      'extras/two/plugin.ts': pluginModule('same'),
    })

    await expect(loadGroupedPluginModules(root, PLUGIN_ENTRY)).rejects.toThrow(
      'two plugins are named same',
    )
  })
})

describe('the built-in plugins written as plugin.ts', () => {
  it('load', async () => {
    const directory = fileURLToPath(new URL('../../plugins-v2', import.meta.url))

    const plugins = await loadGroupedPluginModules(directory, PLUGIN_ENTRY)

    expect(plugins.map(({ plugin }) => plugin.name)).toEqual([
      'agents-md',
      'github-actions',
      't3-env',
      'prettier',
      'lint-staged',
      'biome',
      'eslint',
      'pino',
      'bun',
      'npm',
      'pnpm',
      'yarn',
      'static-csp',
      'seo',
      'tailwind',
      'vitest',
      'knip',
    ])
  })
})
