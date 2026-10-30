import { describe, expect, it } from 'vitest'

import { createEnvironment } from './environment.ts'

const AUTH = { title: 'Better Auth', origin: 'better-auth' }
const DATABASE = { title: 'PostgreSQL', origin: 'postgres' }

const SECRET = {
  name: 'BETTER_AUTH_SECRET',
  scope: 'server',
  description: 'Signs sessions.',
} as const

describe('createEnvironment', () => {
  it('renders .env.example with one block per group, after the base header', () => {
    const environment = createEnvironment()
    environment.add({ ...SECRET, example: 'change-me' }, AUTH)
    environment.add(
      { name: 'DATABASE_URL', scope: 'server', description: 'The connection.', default: 'x' },
      DATABASE,
    )

    expect(environment.renderExample('# Copy this file to .env and fill in the values.\n')).toBe(
      [
        '# Copy this file to .env and fill in the values.',
        '',
        '# Better Auth',
        '# Signs sessions.',
        'BETTER_AUTH_SECRET=change-me',
        '',
        '# PostgreSQL',
        '# The connection.',
        'DATABASE_URL=',
        '',
      ].join('\n'),
    )
  })

  it('prints the header alone without variables', () => {
    expect(createEnvironment().renderExample('# Header\n\n')).toBe('# Header\n')
  })

  it('lists a variable defined twice the same way once, in the first group', () => {
    const environment = createEnvironment()
    environment.add(SECRET, AUTH)
    environment.add(SECRET, DATABASE)

    expect(environment.variables()).toEqual([SECRET])
    expect(environment.renderExample('')).not.toContain('# PostgreSQL')
  })

  it('names both origins when a variable is defined differently', () => {
    const environment = createEnvironment()
    environment.add(SECRET, AUTH)

    expect(() => environment.add({ ...SECRET, scope: 'client' }, DATABASE)).toThrow(
      'better-auth and postgres define the environment variable BETTER_AUTH_SECRET differently',
    )
  })
})
