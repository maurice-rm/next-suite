import { describe, expect, it } from 'vitest'

import { parseTestManifest } from '../test-support/test-manifest.ts'
import { mergeContributions } from './merge-contributions.ts'
import { resolveModules } from './resolve-modules.ts'

describe('resolveModules', () => {
  it('imports #src/ modules through the import prefix and leaves packages alone', () => {
    const values = mergeContributions(
      [
        parseTestManifest('monitoring', {
          contributes: {
            instrumentation: { register: [{ module: '#src/env' }, { module: '@sentry/nextjs' }] },
            instrumentationClient: [{ module: '#src/analytics' }],
            bodyEnd: [{ module: '#src/vitals', export: 'Vitals' }],
            health: [{ name: 'db', module: '#src/lib/db', export: 'isUp' }],
          },
        }),
      ],
      {},
    )

    const resolved = resolveModules(values, '~/')

    expect(resolved.instrumentation.register.map(({ module }) => module)).toEqual([
      '~/env',
      '@sentry/nextjs',
    ])
    expect(resolved.instrumentationClient).toEqual([{ module: '~/analytics' }])
    expect(resolved.bodyEnd).toEqual([{ module: '~/vitals', export: 'Vitals' }])
    expect(resolved.health).toEqual([{ name: 'db', module: '~/lib/db', export: 'isUp' }])
  })
})
