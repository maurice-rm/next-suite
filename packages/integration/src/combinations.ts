import { fileURLToPath } from 'node:url'

const FIXTURE_PLUGINS = fileURLToPath(new URL('../fixtures/plugins/', import.meta.url))

/** A test plugin under `fixtures/plugins/`, only for the combinations, never shipped. */
type TestPlugin =
  | 'postgres'
  | 'sqlite'
  | 'drizzle'
  | 'prisma'
  | 'better-auth'
  | 'blog'
  | 'docker'
  | 'health'

/**
 * A project of test plugins that react to each other: its name, the test plugins it selects and
 * further flags, such as a source directory or no env validation.
 */
export type Combination = {
  name: string
  plugins: readonly TestPlugin[]
  flags: readonly string[]
}

const WITHOUT_ENV_VALIDATION = '--no-env-validation'

/**
 * Every ORM with every database, with Better Auth and the blog, and once without each; the ORM
 * and database plugins read validated variables in some and `process.env` in others. The last
 * one builds a container with a health route.
 */
export const COMBINATIONS: readonly Combination[] = [
  {
    name: 'drizzle-postgres',
    plugins: ['postgres', 'drizzle', 'better-auth', 'blog'],
    flags: [WITHOUT_ENV_VALIDATION],
  },
  {
    name: 'drizzle-sqlite',
    plugins: ['sqlite', 'drizzle', 'better-auth', 'blog'],
    flags: ['--src-dir', '--import-alias', '~/*'],
  },
  {
    name: 'prisma-postgres',
    plugins: ['postgres', 'prisma', 'better-auth', 'blog'],
    flags: ['--src-dir'],
  },
  {
    name: 'prisma-sqlite',
    plugins: ['sqlite', 'prisma', 'better-auth', 'blog'],
    flags: [WITHOUT_ENV_VALIDATION],
  },
  { name: 'without-auth', plugins: ['sqlite', 'drizzle', 'blog'], flags: [] },
  { name: 'without-blog', plugins: ['postgres', 'prisma', 'better-auth'], flags: [] },
  {
    name: 'container-health',
    plugins: ['postgres', 'drizzle', 'docker', 'health'],
    flags: [WITHOUT_ENV_VALIDATION],
  },
]

/** The directory of a test plugin. */
export const testPluginPath = (plugin: TestPlugin): string => `${FIXTURE_PLUGINS}${plugin}`

/** The arguments of create-next-suite that select the plugins and flags of a combination. */
export const argumentsOf = ({ plugins, flags }: Combination): string[] => [
  ...plugins.flatMap((plugin) => ['--plugin', testPluginPath(plugin), `--${plugin}`]),
  ...flags,
  '--yes',
]
