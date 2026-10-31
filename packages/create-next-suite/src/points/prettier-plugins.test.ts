import { describe, expect, it } from 'vitest'

import { createPrettierPlugins } from './prettier-plugins.ts'

describe('createPrettierPlugins', () => {
  it('keeps the plugins in the order they were first added', () => {
    const plugins = createPrettierPlugins()
    plugins.add('prettier-plugin-tailwindcss')
    plugins.add('prettier-plugin-organize-imports')
    plugins.add('prettier-plugin-tailwindcss')

    expect(plugins.names()).toEqual([
      'prettier-plugin-tailwindcss',
      'prettier-plugin-organize-imports',
    ])
  })
})
