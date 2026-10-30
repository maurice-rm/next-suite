import { readFile } from 'node:fs/promises'

import { beforeAll, describe, expect, it } from 'vitest'

const PLUGIN_TYPES_URL = new URL(
  'dist/plugin.d.mts',
  import.meta.resolve('create-next-suite/package.json'),
)

const ZOD_IMPORT = /\bimport\b[^;]*["']zod["']/
/** What a plugin author writes against: the function, the points and the types of a plugin. */
const PUBLIC_NAMES = [
  'definePlugin',
  'defineValuePoint',
  'defineCollectorPoint',
  'optional',
  'Plugin',
  'PluginDefinition',
  'PluginContext',
  'FinishContext',
  'Precondition',
  'ValuePoints',
  'CollectorPoints',
]

let declarations: string

beforeAll(async () => {
  declarations = await readFile(PLUGIN_TYPES_URL, 'utf8')
})

describe('the published plugin types', () => {
  it('import nothing from zod, so plugin authors need no zod to type their plugin', () => {
    expect(declarations).not.toMatch(ZOD_IMPORT)
  })

  it('export definePlugin, the points and the types of a plugin', () => {
    const exported = [
      ...declarations.matchAll(/^export (?:declare const (\w+)|type \{([^}]+)\})/gm),
    ]
      .flatMap(([, constant, types]) =>
        constant === undefined ? (types ?? '').split(',') : [constant],
      )
      .map((name) => name.trim())

    expect(exported).toEqual(expect.arrayContaining(PUBLIC_NAMES))
  })
})
