import { describe, expectTypeOf, it } from 'vitest'

import type { Condition, Logic, PluginManifest } from './plugin.ts'

const MINIMAL = {
  name: 'acme-auth',
  version: '1.0.0',
  contract: '^1.0.0',
  title: 'Acme Auth',
  description: 'Sign-in through Acme.',
}

describe('PluginManifest', () => {
  it('accepts a file without a conflict strategy, since the strategy has a default', () => {
    const manifest = { ...MINIMAL, files: [{ source: 'files/auth.ts', target: 'lib/auth.ts' }] }

    expectTypeOf(manifest).toExtend<PluginManifest>()
  })

  it('rejects an unknown conflict strategy', () => {
    const file = { source: 'a', target: 'b', conflict: 'merge' as const }

    expectTypeOf({ ...MINIMAL, files: [file] }).not.toExtend<PluginManifest>()
  })
})

describe('Condition', () => {
  it('nests conditions in all, any and not', () => {
    const condition = { all: [{ plugin: 'drizzle' }, { not: { any: [{ category: 'api' }] } }] }

    expectTypeOf(condition).toExtend<Condition>()
  })

  it('rejects a condition kind that does not exist', () => {
    expectTypeOf({ unless: { plugin: 'drizzle' } }).not.toExtend<Condition>()
  })
})

describe('Logic', () => {
  it('computes files from the context, synchronously or not', () => {
    const logic: Logic = async (context) => ({
      files: [
        { target: 'lib/name.ts', content: `export const name = '${context.project.name}'\n` },
      ],
      contributes: { gitignore: context.has('plugin:prettier') ? ['/cache'] : [] },
    })

    expectTypeOf(logic).toExtend<Logic>()
  })

  it('rejects a file without content', () => {
    const logic = () => ({ files: [{ target: 'a.ts' }] })

    expectTypeOf(logic).not.toExtend<Logic>()
  })
})
