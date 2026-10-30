import { type Category, categoriesSchema } from '../contract/category.ts'
import type { ParsedPluginManifest } from '../contract/plugin-manifest.ts'
import { BASE_SETTINGS } from '../questions/base-settings.ts'
import { buildQuestions, type Question } from '../questions/build-questions.ts'
import { parseTestManifest } from './test-manifest.ts'

export const TEST_CATEGORIES: Category[] = categoriesSchema.parse([
  {
    section: 'Project',
    categories: [
      {
        id: 'package-manager',
        question: 'Which package manager?',
        cardinality: 'one',
        default: 'pnpm',
      },
    ],
  },
  {
    section: 'Data & API',
    categories: [{ id: 'orm', question: 'Which ORM?', cardinality: 'at-most-one', default: null }],
  },
  {
    section: 'UI',
    categories: [
      { id: 'styling', question: 'Which styling?', cardinality: 'many', default: ['tailwind'] },
    ],
  },
])

export const TEST_PLUGINS: ParsedPluginManifest[] = [
  parseTestManifest('pnpm', {
    category: 'package-manager',
    packageManager: {
      version: '12.16.1',
      ciInstallArgs: ['ci'],
      whenVersionDiffers: 'download',
      allowedBuildsIn: 'pnpm-workspace.yaml',
    },
    files: [{ source: 'files/pnpm-workspace.yaml.hbs', target: 'pnpm-workspace.yaml' }],
  }),
  parseTestManifest('npm', {
    category: 'package-manager',
    packageManager: {
      version: '12.2.1',
      ciInstallArgs: ['ci'],
      whenVersionDiffers: 'warn',
      allowedBuildsIn: 'package.json#allowScripts',
    },
  }),
  parseTestManifest('drizzle', {
    category: 'orm',
    options: {
      casing: {
        type: 'select',
        question: 'Column casing?',
        choices: [
          { value: 'snake', label: 'snake_case' },
          { value: 'camel', label: 'camelCase' },
        ],
        default: 'snake',
      },
    },
  }),
  parseTestManifest('prisma', { category: 'orm' }),
  parseTestManifest('tailwind', { category: 'styling' }),
  parseTestManifest('sass', { category: 'styling' }),
  parseTestManifest('seo', {
    section: 'Integrations',
    selectedByDefault: true,
    options: {
      'og-image': { type: 'boolean', question: 'Add an Open Graph image?', default: false },
      'og-title': {
        type: 'string',
        question: 'Open Graph title?',
        default: 'My app',
        when: { option: 'seo.og-image', equals: true },
      },
    },
  }),
  parseTestManifest('better-auth', {
    requires: [{ when: { category: 'orm' }, reason: 'Stores sessions in the database.' }],
    conflicts: [{ when: { plugin: 'prisma' }, reason: 'Not tested with Prisma.' }],
  }),
]

/** Questions built from small test plugins: three categories, two extras, the base settings. */
export const TEST_QUESTIONS: Question[] = buildQuestions({
  categories: TEST_CATEGORIES,
  plugins: TEST_PLUGINS,
  settings: BASE_SETTINGS,
  runSettings: [],
})
