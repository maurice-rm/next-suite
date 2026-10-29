import { describe, expect, it } from 'vitest'

import { categoriesSchema } from '../contract/category.ts'
import { pluginManifestSchema } from '../contract/plugin-manifest.ts'
import { TEST_QUESTIONS } from '../test-support/questions.ts'
import { buildQuestions } from './questions.ts'

describe('buildQuestions', () => {
  it('asks the categories that need one plugin, then the settings, then the other categories, then plugins without a category', () => {
    expect(TEST_QUESTIONS.map((question) => question.key)).toEqual([
      'package-manager',
      'src-dir',
      'import-alias',
      'react-compiler',
      'cache-components',
      'orm',
      'drizzle.casing',
      'styling',
      'seo',
      'seo.og-image',
      'seo.og-title',
      'better-auth',
    ])
  })

  it('places each question in the section of its category or plugin, and settings in Project', () => {
    const sections = Object.fromEntries(
      TEST_QUESTIONS.map((question) => [question.key, question.section]),
    )

    expect(sections).toMatchObject({
      'package-manager': 'Project',
      'src-dir': 'Project',
      orm: 'Data & API',
      'drizzle.casing': 'Data & API',
      styling: 'UI',
      seo: 'Integrations',
      'seo.og-image': 'Integrations',
      'better-auth': undefined,
    })
  })

  it('marks the categories that need one plugin, and their options, as essential', () => {
    const essential = TEST_QUESTIONS.filter((question) => question.isEssential).map(
      (question) => question.key,
    )

    expect(essential).toEqual(['package-manager'])
  })

  it('rejects a plugin of an unknown category', () => {
    const plugin = pluginManifestSchema.parse({
      name: 'x',
      version: '1.0.0',
      engine: '^1.0.0',
      title: 'x',
      description: 'x',
      category: 'cms',
    })

    expect(() => buildQuestions({ categories: [], plugins: [plugin], settings: [] })).toThrow(
      'the plugin x belongs to the unknown category cms',
    )
  })

  it('rejects a category default that is no plugin of the category', () => {
    const categories = categoriesSchema.parse([
      { id: 'orm', question: '?', cardinality: 'at-most-one', default: 'drizzle' },
    ])
    const plugin = pluginManifestSchema.parse({
      name: 'prisma',
      version: '1.0.0',
      engine: '^1.0.0',
      title: 'p',
      description: 'p',
      category: 'orm',
    })

    expect(() => buildQuestions({ categories, plugins: [plugin], settings: [] })).toThrow(
      'the default drizzle of the category orm is no plugin of that category',
    )
  })
})
