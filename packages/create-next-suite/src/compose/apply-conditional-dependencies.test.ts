import { describe, expect, it } from 'vitest'

import { pluginManifestSchema } from '../contract/plugin-manifest.ts'
import { parseTestManifest } from '../test-support/test-manifest.ts'
import { applyConditionalDependencies } from './apply-conditional-dependencies.ts'

const TAILWIND = parseTestManifest('tailwind', {
  devDependencies: { tailwindcss: '4.3.3' },
  conditionalDependencies: [
    { when: { plugin: 'prettier' }, devDependencies: { 'prettier-plugin-tailwindcss': '0.8.1' } },
  ],
})

const answersWith = (names: string[]) => ({
  plugins: names.map((name) => ({ name, category: undefined })),
  settings: {},
  options: {},
})

describe('applyConditionalDependencies', () => {
  it('adds the dependencies whose condition holds and drops the others', () => {
    expect(
      applyConditionalDependencies(TAILWIND, answersWith(['tailwind', 'prettier'])).devDependencies,
    ).toEqual({ tailwindcss: '4.3.3', 'prettier-plugin-tailwindcss': '0.8.1' })
    expect(
      applyConditionalDependencies(TAILWIND, answersWith(['tailwind'])).devDependencies,
    ).toEqual({
      tailwindcss: '4.3.3',
    })
  })

  it('rejects a dependency that a holding group lists with another version', () => {
    const clash = pluginManifestSchema.parse({
      ...TAILWIND,
      devDependencies: { 'prettier-plugin-tailwindcss': '0.7.0' },
    })

    expect(() => applyConditionalDependencies(clash, answersWith(['prettier']))).toThrow(
      'tailwind lists "prettier-plugin-tailwindcss" with two versions',
    )
  })
})
