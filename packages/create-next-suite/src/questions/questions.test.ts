import { describe, expect, it } from 'vitest'

import { categoriesSchema } from '../contract/category.ts'
import { pluginManifestSchema } from '../contract/plugin-manifest.ts'
import { TEST_CATEGORIES, TEST_PLUGINS, TEST_QUESTIONS } from '../test-support/questions.ts'
import { buildQuestions } from './questions.ts'
import { RUN_SETTINGS } from './run-settings.ts'

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

  it('asks the settings of the run last, in Setup, apart from the project settings', () => {
    const questions = buildQuestions({
      categories: TEST_CATEGORIES,
      plugins: TEST_PLUGINS,
      settings: [],
      runSettings: RUN_SETTINGS,
    })

    expect(
      questions.slice(-2).map((question) => [question.key, question.section, question.kind]),
    ).toEqual([
      ['git', 'Setup', 'setting'],
      ['install', 'Setup', 'setting'],
    ])
    expect(questions.at(-1)).toMatchObject({ scope: 'run' })
  })

  it('marks the categories that need one plugin, and their options, as essential', () => {
    const essential = TEST_QUESTIONS.filter((question) => question.isEssential).map(
      (question) => question.key,
    )

    expect(essential).toEqual(['package-manager'])
  })

  it('lists the plugins of a category in its order, the others after them as loaded', () => {
    const plugin = (name: string) =>
      pluginManifestSchema.parse({
        name,
        version: '1.0.0',
        contract: '^1.0.0',
        title: name,
        description: name,
        category: 'orm',
      })
    const categories = categoriesSchema.parse([
      {
        section: 'Data',
        categories: [
          {
            id: 'orm',
            question: '?',
            cardinality: 'at-most-one',
            default: null,
            order: ['prisma'],
          },
        ],
      },
    ])

    const [question] = buildQuestions({
      categories,
      plugins: ['zeta', 'drizzle', 'prisma'].map(plugin),
      settings: [],
      runSettings: [],
    })

    expect(question?.kind === 'category' && question.choices.map((choice) => choice.name)).toEqual([
      'prisma',
      'zeta',
      'drizzle',
    ])
  })

  it('rejects a plugin of an unknown category', () => {
    const plugin = pluginManifestSchema.parse({
      name: 'x',
      version: '1.0.0',
      contract: '^1.0.0',
      title: 'x',
      description: 'x',
      category: 'cms',
    })

    expect(() =>
      buildQuestions({ categories: [], plugins: [plugin], settings: [], runSettings: [] }),
    ).toThrow('the plugin x belongs to the unknown category cms')
  })

  it('rejects a category default that is no plugin of the category', () => {
    const categories = categoriesSchema.parse([
      {
        section: 'Data',
        categories: [{ id: 'orm', question: '?', cardinality: 'at-most-one', default: 'drizzle' }],
      },
    ])
    const plugin = pluginManifestSchema.parse({
      name: 'prisma',
      version: '1.0.0',
      contract: '^1.0.0',
      title: 'p',
      description: 'p',
      category: 'orm',
    })

    expect(() =>
      buildQuestions({ categories, plugins: [plugin], settings: [], runSettings: [] }),
    ).toThrow('the default drizzle of the category orm is no plugin of that category')
  })
})
