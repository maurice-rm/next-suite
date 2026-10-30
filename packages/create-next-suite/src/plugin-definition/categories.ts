/** The fields every kind of category has. */
type CategoryFields = {
  /** The id in kebab-case, also the flag `--<id>`, such as `orm`. */
  id: string
  /** The question the wizard asks. */
  question: string
  /** The section of the wizard that asks it, such as "Project". */
  section: string
  /** The plugins in the order the wizard lists them; the others follow by directory name. */
  order?: string[]
}

/**
 * A group of plugins answering one question of the wizard, and how many of them a project takes:
 * exactly one, at most one or any number.
 */
export type Category = CategoryFields &
  (
    | { cardinality: 'one'; default: string }
    | { cardinality: 'at-most-one'; default: string | null }
    | { cardinality: 'many'; default: string[] }
  )

/** The category of the package manager plugins, whose name is the command the project runs with. */
export const PACKAGE_MANAGER_CATEGORY = 'package-manager'

const PROJECT = 'Project'
const UI = 'UI'
const TOOLING = 'Tooling'
const APP = 'App'
const DEPLOYMENT = 'Deployment'

/** The categories of the built-in plugins in the order the wizard asks them; plugins run in it too. */
export const CATEGORIES: readonly Category[] = [
  {
    id: PACKAGE_MANAGER_CATEGORY,
    question: 'Which package manager would you like to use?',
    section: PROJECT,
    cardinality: 'one',
    default: 'pnpm',
    order: ['npm', 'pnpm', 'bun', 'yarn'],
  },
  {
    id: 'styling',
    question: 'Which styling would you like to use?',
    section: UI,
    cardinality: 'many',
    default: ['tailwind'],
  },
  {
    id: 'linter',
    question: 'Which linter would you like to use?',
    section: TOOLING,
    cardinality: 'at-most-one',
    default: 'eslint',
    order: ['eslint', 'biome'],
  },
  {
    id: 'formatter',
    question: 'Which formatter would you like to use?',
    section: TOOLING,
    cardinality: 'at-most-one',
    default: 'prettier',
  },
  {
    id: 'unused-code',
    question: 'Find unused code with Knip?',
    section: TOOLING,
    cardinality: 'at-most-one',
    default: 'knip',
  },
  {
    id: 'git-hooks',
    question: 'Lint and format staged files before each commit?',
    section: TOOLING,
    cardinality: 'at-most-one',
    default: 'lint-staged',
  },
  {
    id: 'unit-tests',
    question: 'Which unit test runner would you like to use?',
    section: TOOLING,
    cardinality: 'at-most-one',
    default: 'vitest',
  },
  {
    id: 'env-validation',
    question: 'Validate environment variables?',
    section: APP,
    cardinality: 'at-most-one',
    default: 't3-env',
  },
  {
    id: 'logging',
    question: 'Which logger would you like to use?',
    section: APP,
    cardinality: 'at-most-one',
    default: 'pino',
  },
  {
    id: 'security-headers',
    question: 'Send security headers?',
    section: APP,
    cardinality: 'at-most-one',
    default: 'static-csp',
  },
  {
    id: 'seo',
    question: 'Add robots.txt, a sitemap and the site URL?',
    section: APP,
    cardinality: 'at-most-one',
    default: 'seo',
  },
  {
    id: 'ci',
    question: 'Which CI would you like to use?',
    section: DEPLOYMENT,
    cardinality: 'at-most-one',
    default: 'github-actions',
  },
  {
    id: 'agents',
    question: 'Add AGENTS.md for coding agents?',
    section: DEPLOYMENT,
    cardinality: 'at-most-one',
    default: 'agents-md',
  },
]
