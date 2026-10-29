import { type Category, categoriesSchema } from '../contract/category.ts'
import { type ParsedPluginManifest, pluginManifestSchema } from '../contract/plugin-manifest.ts'
import { BASE_SETTINGS } from '../input/base-settings.ts'
import { buildQuestions, type Question } from '../input/questions.ts'

const manifest = (name: string, extra: object = {}): ParsedPluginManifest =>
  pluginManifestSchema.parse({
    name,
    version: '1.0.0',
    contract: '^1.0.0',
    title: name,
    description: `The ${name} plugin.`,
    ...extra,
  })

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
  manifest('pnpm', {
    category: 'package-manager',
    packageManager: {
      version: '12.16.1',
      whenVersionDiffers: 'download',
      allowedBuildsIn: 'pnpm-workspace.yaml',
    },
    files: [{ source: 'files/pnpm-workspace.yaml.hbs', target: 'pnpm-workspace.yaml' }],
  }),
  manifest('npm', {
    category: 'package-manager',
    packageManager: {
      version: '12.2.1',
      whenVersionDiffers: 'warn',
      allowedBuildsIn: 'package.json#allowScripts',
    },
  }),
  manifest('drizzle', {
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
  manifest('prisma', { category: 'orm' }),
  manifest('tailwind', { category: 'styling' }),
  manifest('sass', { category: 'styling' }),
  manifest('seo', {
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
  manifest('better-auth', {
    requires: [{ when: { category: 'orm' }, reason: 'Stores sessions in the database.' }],
    conflicts: [{ when: { plugin: 'prisma' }, reason: 'Not tested with Prisma.' }],
  }),
]

/** Questions built from small test plugins: three categories, two addons, the base settings. */
export const TEST_QUESTIONS: Question[] = buildQuestions({
  categories: TEST_CATEGORIES,
  plugins: TEST_PLUGINS,
  settings: BASE_SETTINGS,
  runSettings: [],
})
