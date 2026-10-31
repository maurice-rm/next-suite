import { describe, expect, it } from 'vitest'

import { createKnipOptions } from './knip-options.ts'

describe('createKnipOptions', () => {
  it('answers only the options that have values, each value once', () => {
    const knip = createKnipOptions()
    knip.ignoreDependencies('pg')
    knip.entry('drizzle.config.ts', 'lib/auth-client.ts')
    knip.entry('drizzle.config.ts')

    expect(knip.options()).toEqual(
      new Map([
        ['entry', ['drizzle.config.ts', 'lib/auth-client.ts']],
        ['ignoreDependencies', ['pg']],
      ]),
    )
  })
})
