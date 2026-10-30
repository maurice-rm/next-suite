import { describe, expect, it } from 'vitest'

import { contributionsSchema } from '../contract/contributions.ts'
import { parseTestManifest } from '../test-support/test-manifest.ts'
import { mergeContributions } from './merge-contributions.ts'
import { type RunValues, templateValues } from './template-values.ts'

const VALUES = mergeContributions([], {})

const RUN: RunValues = {
  project: {
    name: 'my-app',
    importAlias: '@/*',
    importAliasTarget: './*',
    importPrefix: '@/',
    packageManager: 'npm',
    run: 'npm run',
    ciInstall: 'npm ci',
  },
  settings: {},
  options: {},
}

describe('templateValues', () => {
  it('gives no template value or composition point the name of a run value', () => {
    const names = [
      ...Object.keys(templateValues(VALUES)),
      ...Object.keys(contributionsSchema.shape),
    ]

    expect(names.filter((name) => Object.hasOwn(RUN, name))).toEqual([])
  })

  it('leaves out what only the core reads', () => {
    for (const name of [
      'fields',
      'dependencies',
      'devDependencies',
      'instrumentation',
      'instrumentationClient',
      'generatedDirs',
    ]) {
      expect(templateValues(VALUES)).not.toHaveProperty(name)
    }
  })

  it('lists the scripts in plugin order as key and value', () => {
    const values = mergeContributions(
      [
        parseTestManifest('base', {
          contributes: { package: { scripts: { dev: 'next dev', build: 'next build' } } },
        }),
      ],
      {},
    )

    expect(templateValues(values).scripts).toEqual([
      { key: 'dev', value: 'next dev' },
      { key: 'build', value: 'next build' },
    ])
  })
})
