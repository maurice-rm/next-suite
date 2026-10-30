import { readdir, readFile } from 'node:fs/promises'

import { describe, expect, it } from 'vitest'

const DIST_URL = new URL('dist/', import.meta.resolve('create-next-suite/package.json'))
const DECLARATION_EXTENSION = '.d.mts'

const ZOD_IMPORT = /\bimport\b[^;]*["']zod["']/
const EXPORT = /^export (?:declare const (\w+)|(?:type )?\{([^}]+)\})/gm
/** What a plugin author writes against: the function, the points and the types of a plugin. */
const PLUGIN_NAMES = [
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
/** The shared points a plugin uses, provides and contributes to without naming another plugin. */
const POINTS_NAMES = [
  'database',
  'orm',
  'validatedEnv',
  'databaseSchema',
  'container',
  'health',
  'readFromValidatedEnv',
  'Database',
  'Orm',
  'ValidatedEnv',
  'DatabaseSchema',
  'Container',
  'HealthChecks',
]
/** What a project's next-suite.config.ts writes against. */
const CONFIG_NAMES = ['defineSuiteConfig', 'definePlugin', 'PluginRegistry', 'SuiteConfig']

const readDeclarations = (file: string): Promise<string> =>
  readFile(new URL(file, DIST_URL), 'utf8')

/** The names a declaration file exports, values and types alike. */
const exportedNames = (declarations: string): string[] =>
  [...declarations.matchAll(EXPORT)]
    .flatMap(([, constant, names]) =>
      constant === undefined ? (names ?? '').split(',') : [constant],
    )
    .map((name) => name.trim().replace(/^type /, ''))

describe('the published types', () => {
  it('import nothing from zod, so authors and projects need no zod for their types', async () => {
    const files = (await readdir(DIST_URL)).filter((file) => file.endsWith(DECLARATION_EXTENSION))

    for (const file of files) {
      expect(await readDeclarations(file)).not.toMatch(ZOD_IMPORT)
    }
  })

  it('export definePlugin, the points and the types of a plugin', async () => {
    expect(exportedNames(await readDeclarations('plugin.d.mts'))).toEqual(
      expect.arrayContaining(PLUGIN_NAMES),
    )
  })

  it('export the shared points, their values and collectors', async () => {
    expect(exportedNames(await readDeclarations('points.d.mts'))).toEqual(
      expect.arrayContaining(POINTS_NAMES),
    )
  })

  it('export defineSuiteConfig and the registry a project config is typed against', async () => {
    expect(exportedNames(await readDeclarations('config.d.mts'))).toEqual(
      expect.arrayContaining(CONFIG_NAMES),
    )
  })
})
