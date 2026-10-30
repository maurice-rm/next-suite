import { describe, expect, it } from 'vitest'

import { createProvenance } from './provenance.ts'

describe('createProvenance', () => {
  it('lists each file’s operations in the order they ran, files sorted by path', () => {
    const provenance = createProvenance()
    provenance.record({ path: 'lib/logger.ts', plugin: 'pino', operation: 'copy', kind: 'own' })
    provenance.record({ path: 'app/layout.tsx', plugin: 'base', operation: 'base', kind: 'own' })
    provenance.record({
      path: 'lib/logger.ts',
      plugin: 'tweaks',
      operation: 'edit (a file of pino)',
      kind: 'direct',
    })

    expect(provenance.operationsOf('lib/logger.ts')).toEqual([
      { plugin: 'pino', operation: 'copy', kind: 'own' },
      { plugin: 'tweaks', operation: 'edit (a file of pino)', kind: 'direct' },
    ])
    expect(Object.keys(provenance.toJson().files)).toEqual(['app/layout.tsx', 'lib/logger.ts'])
  })

  it('records the order and each point’s provider, users and contributors', () => {
    const provenance = createProvenance()
    provenance.recordOrder(['pino', 'tweaks'])
    provenance.recordProvider('logger', 'pino')
    provenance.recordUse('logger', 'tweaks')
    provenance.recordContribution('logger', 'tweaks')

    expect(provenance.toJson()).toEqual({
      order: ['pino', 'tweaks'],
      points: { logger: { provider: 'pino', users: ['tweaks'], contributors: ['tweaks'] } },
      files: {},
    })
  })
})
