import { describe, expectTypeOf, it } from 'vitest'

import type { Condition, PluginManifest } from './plugin.ts'

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
