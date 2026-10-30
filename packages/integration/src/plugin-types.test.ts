import { readFile } from 'node:fs/promises'

import { describe, expect, it } from 'vitest'

const PLUGIN_TYPES_URL = new URL(
  'dist/plugin.d.mts',
  import.meta.resolve('create-next-suite/package.json'),
)

const ZOD_IMPORT = /\bimport\b[^;]*["']zod["']/

describe('the published plugin types', () => {
  it('import nothing from zod, so plugin authors need no zod to type their plugin', async () => {
    const declarations = await readFile(PLUGIN_TYPES_URL, 'utf8')

    expect(declarations).not.toMatch(ZOD_IMPORT)
  })
})
