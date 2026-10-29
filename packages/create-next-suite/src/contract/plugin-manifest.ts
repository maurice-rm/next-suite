import semver from 'semver'
import * as z from 'zod'

import { conditionSchema } from './condition.ts'
import { contributionsSchema } from './contributions.ts'
import { kebabCaseId, pluginName } from './identifiers.ts'
import { pluginOptionSchema } from './plugin-option.ts'

/**
 * The version of the plugin contract this release of create-next-suite implements. A plugin's
 * `engine` range is checked against it before the plugin loads.
 */
export const CONTRACT_VERSION = '1.0.0'

const CATALOG_PREFIX = 'catalog:'
const CLIENT_ENV_PREFIX = 'NEXT_PUBLIC_'
const ENV_NAME = /^[A-Z][A-Z0-9_]*$/

const ruleSchema = z.strictObject({
  when: conditionSchema,
  reason: z.string().min(1),
})

const isVersionSpec = (spec: string): boolean =>
  spec.startsWith(CATALOG_PREFIX)
    ? kebabCaseId.safeParse(spec.slice(CATALOG_PREFIX.length)).success
    : semver.validRange(spec) !== null

const dependenciesSchema = z.record(
  z.string().min(1),
  z.string().refine(isVersionSpec, 'Use `catalog:<name>` or a semver range'),
)

const envVariableSchema = z
  .strictObject({
    name: z.string().regex(ENV_NAME, 'Use upper case, such as `DATABASE_URL`'),
    scope: z.enum(['server', 'client']),
    secret: z.boolean(),
    example: z.string(),
    description: z.string().min(1),
  })
  .refine(
    (variable) => (variable.scope === 'client') === variable.name.startsWith(CLIENT_ENV_PREFIX),
    {
      message: `A client variable starts with ${CLIENT_ENV_PREFIX}, a server variable does not`,
      path: ['name'],
    },
  )

const pluginFileSchema = z.strictObject({
  source: z.string().min(1),
  target: z.string().min(1),
  when: conditionSchema.optional(),
  conflict: z.enum(['error', 'skip-if-exists', 'replace']).default('error'),
  root: z.enum(['project', 'source']).default('project').meta({
    description: '`source` places the target under src/ when the project uses a src folder.',
  }),
})

/** The manifest of a plugin, read from its `plugin.json`. */
export const pluginManifestSchema = z
  .strictObject({
    // biome-ignore lint/style/useNamingConvention: JSON Schema fixes the name of this key
    $schema: z.string().optional(),
    name: pluginName,
    version: z.string().refine((value) => semver.valid(value) !== null, 'Use a semver version'),
    engine: z.string().refine((value) => semver.validRange(value) !== null, 'Use a semver range'),
    title: z.string().min(1),
    description: z.string().min(1),
    category: kebabCaseId.optional(),
    options: z.record(kebabCaseId, pluginOptionSchema).optional(),
    requires: z.array(ruleSchema).optional(),
    conflicts: z.array(ruleSchema).optional(),
    dependencies: dependenciesSchema.optional(),
    devDependencies: dependenciesSchema.optional(),
    env: z.array(envVariableSchema).optional(),
    files: z.array(pluginFileSchema).optional(),
    facts: z.record(kebabCaseId, conditionSchema).optional(),
    contributes: contributionsSchema.optional(),
  })
  .meta({ title: 'next-suite plugin manifest' })

/** The manifest of a plugin as its author writes it in `plugin.json`. */
export type PluginManifest = z.input<typeof pluginManifestSchema>

/** A validated manifest, with defaults such as a file's conflict strategy filled in. */
export type ParsedPluginManifest = z.output<typeof pluginManifestSchema>
