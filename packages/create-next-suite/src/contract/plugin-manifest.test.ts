import { describe, expect, it } from 'vitest'

import { pluginManifestSchema } from './plugin-manifest.ts'

const MINIMAL = {
  name: 'acme-auth',
  version: '1.0.0',
  engine: '^1.0.0',
  title: 'Acme Auth',
  description: 'Sign-in through Acme.',
}

const issuePaths = (input: unknown): string[] => {
  const result = pluginManifestSchema.safeParse(input)
  return result.success ? [] : result.error.issues.map((issue) => issue.path.join('.'))
}

describe('pluginManifestSchema', () => {
  it('accepts a manifest with only the required fields', () => {
    expect(pluginManifestSchema.parse(MINIMAL)).toEqual(MINIMAL)
  })

  it('accepts a scoped plugin name', () => {
    expect(issuePaths({ ...MINIMAL, name: '@acme/auth' })).toEqual([])
  })

  it('rejects an unknown field, so a typo never passes silently', () => {
    expect(issuePaths({ ...MINIMAL, dependecies: {} })).toEqual([''])
  })

  it('rejects a version and an engine that are not semver', () => {
    expect(issuePaths({ ...MINIMAL, version: 'latest', engine: 'one' })).toEqual([
      'version',
      'engine',
    ])
  })

  it('accepts dependency versions from the catalog or as a semver range', () => {
    const manifest = {
      ...MINIMAL,
      dependencies: { 'drizzle-orm': 'catalog:drizzle-orm', zod: '^4.6.0' },
    }

    expect(issuePaths(manifest)).toEqual([])
  })

  it('rejects a dependency version that is neither', () => {
    expect(issuePaths({ ...MINIMAL, dependencies: { zod: 'newest' } })).toEqual([
      'dependencies.zod',
    ])
  })

  it('requires client variables to start with NEXT_PUBLIC_ and server variables not to', () => {
    const variable = { scope: 'client', secret: false, example: '', description: 'The URL.' }
    const manifest = {
      ...MINIMAL,
      env: [
        { ...variable, name: 'APP_URL' },
        { ...variable, name: 'NEXT_PUBLIC_TOKEN', scope: 'server' },
        { ...variable, name: 'NEXT_PUBLIC_APP_URL' },
      ],
    }

    expect(issuePaths(manifest)).toEqual(['env.0.name', 'env.1.name'])
  })

  it('defaults the conflict strategy of a file to error', () => {
    const manifest = pluginManifestSchema.parse({
      ...MINIMAL,
      files: [{ source: 'files/auth.ts', target: 'lib/auth.ts' }],
    })

    expect(manifest.files?.[0]?.conflict).toBe('error')
  })

  it('rejects a select option whose default is not a choice', () => {
    const option = {
      type: 'select',
      question: 'Which provider?',
      choices: [{ value: 'github', label: 'GitHub' }],
      default: 'gitlab',
    }

    expect(issuePaths({ ...MINIMAL, options: { provider: option } })).toEqual([
      'options.provider.default',
    ])
  })

  it('requires a default for every option', () => {
    const option = { type: 'boolean', question: 'Add an OG image?' }

    expect(issuePaths({ ...MINIMAL, options: { 'og-image': option } })).toEqual([
      'options.og-image.default',
    ])
  })

  it('rejects package fields the core writes itself', () => {
    const manifest = {
      ...MINIMAL,
      contributes: { package: { fields: { name: 'other', private: true } } },
    }

    expect(issuePaths(manifest)).toEqual(['contributes.package.fields.name'])
  })

  it('takes requirements and conflicts as conditions with a reason', () => {
    const manifest = {
      ...MINIMAL,
      requires: [{ when: { category: 'orm' }, reason: 'Stores sessions in the database.' }],
      conflicts: [{ when: { plugin: 'better-auth' }, reason: 'Both handle sign-in.' }],
    }

    expect(issuePaths(manifest)).toEqual([])
  })
})
