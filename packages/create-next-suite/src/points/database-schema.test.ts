import { describe, expect, it } from 'vitest'

import { createDatabaseSchema } from './database-schema.ts'
import { PointError } from './point-error.ts'

describe('createDatabaseSchema', () => {
  it('keeps the modules in the order they were added, a repeated one once', () => {
    const schema = createDatabaseSchema()
    schema.add('auth', 'export const user = table();')
    schema.add('blog', 'export const post = table();')
    schema.add('auth', 'export const user = table();')

    expect(schema.modules()).toEqual([
      { name: 'auth', code: 'export const user = table();' },
      { name: 'blog', code: 'export const post = table();' },
    ])
  })

  it('refuses another module under a name taken already', () => {
    const schema = createDatabaseSchema()
    schema.add('auth', 'export const user = table();')

    expect(() => schema.add('auth', 'export const account = table();')).toThrow(
      new PointError('the database schema has a module "auth" already'),
    )
  })
})
