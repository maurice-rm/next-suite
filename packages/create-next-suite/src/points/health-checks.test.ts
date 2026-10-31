import { describe, expect, it } from 'vitest'

import { createHealthChecks } from './health-checks.ts'
import { PointError } from './point-error.ts'

const DATABASE_CHECK = { name: 'checkDatabase', from: '@/db/health' }

describe('createHealthChecks', () => {
  it('keeps the checks in the order they were added, a repeated one once', () => {
    const health = createHealthChecks()
    health.check('database', DATABASE_CHECK)
    health.check('cache', { name: 'checkCache', from: '@/lib/cache' })
    health.check('database', { ...DATABASE_CHECK })

    expect(health.checks()).toEqual([
      { name: 'database', run: DATABASE_CHECK },
      { name: 'cache', run: { name: 'checkCache', from: '@/lib/cache' } },
    ])
  })

  it('refuses another check under a name taken already', () => {
    const health = createHealthChecks()
    health.check('database', DATABASE_CHECK)

    expect(() => health.check('database', { name: 'ping', from: '@/lib/ping' })).toThrow(
      new PointError('the health route runs a check "database" already'),
    )
  })
})
