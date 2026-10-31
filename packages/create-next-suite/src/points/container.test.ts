import { describe, expect, it } from 'vitest'

import { createContainer } from './container.ts'
import { PointError } from './point-error.ts'

const DATABASE = { image: 'postgres:18-alpine', ports: ['5432:5432'] }

describe('createContainer', () => {
  it('keeps build arguments, variables and services in the order they were first given', () => {
    const container = createContainer()
    container.buildArg('NEXT_PUBLIC_SITE_URL')
    container.env('DATABASE_URL', 'postgresql://db:5432/app')
    container.service('db', DATABASE)
    container.buildArg('NEXT_PUBLIC_SITE_URL')
    container.env('DATABASE_URL', 'postgresql://db:5432/app')
    container.service('db', { ...DATABASE })

    expect(container.buildArgs()).toEqual(['NEXT_PUBLIC_SITE_URL'])
    expect(container.environment()).toEqual(new Map([['DATABASE_URL', 'postgresql://db:5432/app']]))
    expect(container.services()).toEqual(new Map([['db', DATABASE]]))
  })

  it('refuses another value for a variable set already', () => {
    const container = createContainer()
    container.env('LOG_LEVEL', 'info')

    expect(() => container.env('LOG_LEVEL', 'debug')).toThrow(
      new PointError('the container sets LOG_LEVEL to "info" already'),
    )
  })

  it('refuses another service under a name taken already', () => {
    const container = createContainer()
    container.service('db', DATABASE)

    expect(() => container.service('db', { image: 'mysql:9' })).toThrow(
      new PointError('the container runs a service "db" already'),
    )
  })
})
