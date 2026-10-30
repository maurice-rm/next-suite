import { describe, expect, it } from 'vitest'

import { toAuthorJsonSchema } from './json-schemas.ts'
import { registryIndexSchema } from './registry-index.ts'

const indexWith = (description: string) => ({
  name: '@acme',
  plugins: [{ name: 'mail', path: 'mail', description }],
})

const UNPRINTABLE = {
  'an escape sequence': 'Sends mail.\u001b[2K',
  'a bidi override': 'Sends ‮mail.',
  'a zero-width character': 'Sends​mail.',
}

/** The pattern the published JSON schema sets for a plugin description, as an editor reads it. */
const publishedDescriptionPattern = (): RegExp => {
  const schema = JSON.stringify(toAuthorJsonSchema(registryIndexSchema))
  const pattern = JSON.parse(schema).$defs.RegistryPlugin.properties.description.pattern
  return new RegExp(pattern, 'u')
}

describe('the registry index', () => {
  it.each(Object.entries(UNPRINTABLE))('refuses a description with %s', (_, description) => {
    expect(registryIndexSchema.safeParse(indexWith(description)).success).toBe(false)
    expect(publishedDescriptionPattern().test(description)).toBe(false)
  })

  it('accepts a description in any language', () => {
    const description = 'Sendet E-Mails über Acme – schnell.'

    expect(registryIndexSchema.safeParse(indexWith(description)).success).toBe(true)
    expect(publishedDescriptionPattern().test(description)).toBe(true)
  })
})
