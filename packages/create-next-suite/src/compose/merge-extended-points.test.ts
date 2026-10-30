import { describe, expect, it } from 'vitest'

import type { PluginManifest } from '../contract/plugin-manifest.ts'
import { parseTestManifest } from '../test-support/test-manifest.ts'
import { mergeExtendedPoints } from './merge-extended-points.ts'

const contributing = (name: string, contributes: PluginManifest['contributes']) =>
  parseTestManifest(name, { contributes })

describe('mergeExtendedPoints', () => {
  it('keeps plugin order and drops duplicate instrumentation hooks', () => {
    const values = mergeExtendedPoints([
      contributing('env', { instrumentation: { register: [{ module: '#src/env' }] } }),
      contributing('logger', {
        instrumentation: {
          register: [{ module: '#src/env' }],
          onRequestError: [{ module: '#src/lib/logger', export: 'reportRequestError' }],
        },
      }),
    ])

    expect(values.instrumentation).toEqual({
      register: [{ module: '#src/env' }],
      onRequestError: [{ module: '#src/lib/logger', export: 'reportRequestError' }],
    })
  })

  it('ignores generated folders in the linter and Knip', () => {
    const values = mergeExtendedPoints([
      contributing('orm', { generatedDirs: ['src/generated'], knip: { entry: ['seed.ts'] } }),
    ])

    expect(values.generatedDirs).toEqual(['src/generated'])
    expect(values.lint.ignores).toEqual(['src/generated/**'])
    expect(values.knip).toEqual([
      { key: 'entry', values: ['seed.ts'] },
      { key: 'ignore', values: ['src/generated/**'] },
    ])
  })

  it('leaves out Knip options without values', () => {
    expect(mergeExtendedPoints([]).knip).toEqual([])
  })

  it('accepts the same tsconfig path twice and renders its targets as JSON', () => {
    const paths = { '~/content/*': ['./content/*'] }
    const values = mergeExtendedPoints([
      contributing('a', { tsconfig: { paths } }),
      contributing('b', { tsconfig: { paths } }),
    ])

    expect(values.tsconfig.paths).toEqual([{ alias: '~/content/*', targets: '["./content/*"]' }])
  })

  it('rejects one tsconfig path pointing to different targets', () => {
    expect(() =>
      mergeExtendedPoints([
        contributing('a', { tsconfig: { paths: { '~/x': ['./a'] } } }),
        contributing('b', { tsconfig: { paths: { '~/x': ['./b'] } } }),
      ]),
    ).toThrow('a and b point the tsconfig path "~/x" to different targets')
  })

  it('rejects one compose service defined differently', () => {
    expect(() =>
      mergeExtendedPoints([
        contributing('a', { container: { services: [{ name: 'db', image: 'postgres:18' }] } }),
        contributing('b', { container: { services: [{ name: 'db', image: 'postgres:17' }] } }),
      ]),
    ).toThrow('a and b define the compose service "db" differently')
  })

  it('merges the sources of a CSP directive across plugins', () => {
    const values = mergeExtendedPoints([
      contributing('headers', { csp: { 'img-src': ["'self'"], 'object-src': ["'none'"] } }),
      contributing('cdn', { csp: { 'img-src': ["'self'", 'https://cdn.example.com'] } }),
    ])

    expect(values.csp).toEqual([
      { directive: 'img-src', sources: ["'self'", 'https://cdn.example.com'] },
      { directive: 'object-src', sources: ["'none'"] },
    ])
  })

  it('rejects two modules exporting the same name at the end of the body', () => {
    expect(() =>
      mergeExtendedPoints([
        contributing('a', { bodyEnd: [{ module: 'a-analytics', export: 'Analytics' }] }),
        contributing('b', { bodyEnd: [{ module: 'b-analytics', export: 'Analytics' }] }),
      ]),
    ).toThrow('a-analytics and b-analytics both export "Analytics" for the end of the body')
  })
})
