import type { Category } from '../plugin-definition/categories.ts'
import type { Plugin } from '../plugin-definition/plugin-definition.ts'
import { BASE_SETTINGS } from '../questions/base-settings.ts'
import { buildQuestions, type Question } from '../questions/build-questions.ts'

export const TEST_CATEGORIES: Category[] = [
  {
    id: 'package-manager',
    question: 'Which package manager?',
    section: 'Project',
    cardinality: 'one',
    default: 'pnpm',
  },
  {
    id: 'orm',
    question: 'Which ORM?',
    section: 'Data & API',
    cardinality: 'at-most-one',
    default: null,
  },
  {
    id: 'styling',
    question: 'Which styling?',
    section: 'UI',
    cardinality: 'many',
    default: ['tailwind'],
  },
]

/** A test plugin with the name as its title and a description. */
export const testPlugin = (name: string, fields: Partial<Plugin> = {}): Plugin => ({
  name,
  title: name,
  description: `The ${name} plugin.`,
  ...fields,
})

export const TEST_PLUGINS: Plugin[] = [
  testPlugin('pnpm', { category: 'package-manager' }),
  testPlugin('npm', { category: 'package-manager' }),
  testPlugin('drizzle', {
    category: 'orm',
    options: {
      casing: {
        question: 'Column casing?',
        choices: [
          { value: 'snake', label: 'snake_case' },
          { value: 'camel', label: 'camelCase' },
        ],
        default: 'snake',
      },
    },
  }),
  testPlugin('prisma', { category: 'orm' }),
  testPlugin('tailwind', { category: 'styling' }),
  testPlugin('sass', { category: 'styling' }),
  testPlugin('seo', {
    section: 'Integrations',
    options: {
      'og-image': { type: 'boolean', question: 'Add an Open Graph image?', default: false },
    },
  }),
  testPlugin('better-auth', { conflicts: { prisma: 'Not tested with Prisma.' } }),
]

/** Questions built from small test plugins: three categories, two extras, the base settings. */
export const TEST_QUESTIONS: Question[] = buildQuestions({
  categories: TEST_CATEGORIES,
  plugins: TEST_PLUGINS,
  settings: BASE_SETTINGS,
  runSettings: [],
})
