import semver from 'semver'
import * as z from 'zod'

import { conditionSchema } from './condition.ts'
import { contributionsSchema } from './contributions.ts'
import { kebabCaseId, pluginName, scriptName } from './identifiers.ts'
import { pluginOptionSchema } from './plugin-option.ts'

/**
 * The version of the plugin contract this release of create-next-suite implements. A plugin's
 * `contract` range is checked against it before the plugin loads.
 */
export const CONTRACT_VERSION = '1.0.0'

/** The category of the package manager plugins; each of them fills the package manager adapter. */
export const PACKAGE_MANAGER_CATEGORY = 'package-manager'

const CATALOG_PREFIX = 'catalog:'
const CLIENT_ENV_PREFIX = 'NEXT_PUBLIC_'
const ENV_NAME = /^[A-Z][A-Z0-9_]*$/

const ruleSchema = z.strictObject({
  when: conditionSchema,
  reason: z.string().min(1),
})

const isCatalogSpec = (spec: string): boolean =>
  spec.startsWith(CATALOG_PREFIX) &&
  kebabCaseId.safeParse(spec.slice(CATALOG_PREFIX.length)).success

const isVersionSpec = (spec: string): boolean =>
  isCatalogSpec(spec) || semver.validRange(spec) !== null

const isExactVersionSpec = (spec: string): boolean =>
  isCatalogSpec(spec) || semver.valid(spec) !== null

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
  source: z.string().min(1).meta({
    description:
      'A path in the plugin folder; a source ending in `.hbs` is rendered as a template, any other is copied as it is.',
  }),
  target: z.string().min(1),
  when: conditionSchema.optional(),
  conflict: z.enum(['error', 'skip-if-exists', 'replace']).default('error'),
  root: z.enum(['project', 'source']).default('project').meta({
    description: '`source` places the target under src/ when the project uses a src folder.',
  }),
})

/** Marks `allowedBuildsIn` values that name a field of package.json, such as `package.json#allowScripts`. */
export const PACKAGE_JSON_FIELD_PREFIX = 'package.json#'

const PACKAGE_JSON_BUILD_FIELDS: ReadonlySet<string> = new Set([
  'allowScripts',
  'dependenciesMeta',
  'trustedDependencies',
])

const isPackageJsonBuildField = (place: string): boolean =>
  !place.startsWith(PACKAGE_JSON_FIELD_PREFIX) ||
  PACKAGE_JSON_BUILD_FIELDS.has(place.slice(PACKAGE_JSON_FIELD_PREFIX.length))

const packageManagerSchema = z
  .strictObject({
    version: z
      .string()
      .refine(isExactVersionSpec, 'Use `catalog:<name>` or an exact version')
      .meta({ description: 'The version written to `packageManager` in package.json.' }),
    installArgs: z.array(z.string().min(1)).min(1).default(['install']).meta({
      description:
        'The arguments of the first install, such as `["install", "--no-immutable"]` for Yarn, which forbids creating a lockfile in CI otherwise.',
    }),
    whenVersionDiffers: z.enum(['download', 'warn', 'error']).meta({
      description:
        'What a project asks for when it runs with another version, through `devEngines.packageManager`.',
    }),
    allowedBuildsIn: z
      .string()
      .min(1)
      .refine(
        isPackageJsonBuildField,
        'Use package.json#allowScripts, package.json#dependenciesMeta or package.json#trustedDependencies',
      )
      .meta({
        description:
          'Where the allowed dependency builds go: a package.json field such as `package.json#allowScripts`, or the target of a file of this plugin that lists them itself.',
      }),
  })
  .meta({
    description:
      'How the core uses this package manager; the plugin name is its command. Only for plugins in the package-manager category.',
  })

const conditionalDependenciesSchema = z.strictObject({
  when: conditionSchema,
  dependencies: dependenciesSchema.optional(),
  devDependencies: dependenciesSchema.optional(),
})

const postStepSchema = z.strictObject({
  script: scriptName,
  when: conditionSchema.optional(),
  running: z.string().min(1).optional().meta({
    description: 'What the run shows while the script runs, such as "Fixing files".',
  }),
  done: z.string().min(1).optional().meta({
    description: 'What the run shows when the script succeeded, such as "Fixed files".',
  }),
})

/** The manifest of a plugin, read from its `plugin.json`. */
export const pluginManifestSchema = z
  .strictObject({
    // biome-ignore lint/style/useNamingConvention: JSON Schema fixes the name of this key
    $schema: z.string().optional(),
    name: pluginName,
    version: z.string().refine((value) => semver.valid(value) !== null, 'Use a semver version'),
    contract: z
      .string()
      .refine((value) => semver.validRange(value) !== null, 'Use a semver range')
      .meta({ description: 'The versions of the plugin contract this plugin works with.' }),
    title: z.string().min(1),
    description: z.string().min(1),
    category: kebabCaseId.optional(),
    section: z.string().min(1).optional().meta({
      description:
        'The section of the wizard the question belongs to; only for plugins without a category.',
    }),
    selectedByDefault: z.boolean().optional().meta({
      description: 'Whether `--yes` selects this plugin; only for plugins without a category.',
    }),
    options: z.record(kebabCaseId, pluginOptionSchema).optional(),
    requires: z.array(ruleSchema).optional(),
    conflicts: z.array(ruleSchema).optional(),
    dependencies: dependenciesSchema.optional(),
    devDependencies: dependenciesSchema.optional(),
    conditionalDependencies: z.array(conditionalDependenciesSchema).optional().meta({
      description:
        'Dependencies added only when a condition holds, such as a Prettier plugin when Prettier is selected.',
    }),
    env: z.array(envVariableSchema).optional(),
    files: z.array(pluginFileSchema).optional(),
    facts: z.record(kebabCaseId, conditionSchema).optional(),
    contributes: contributionsSchema.optional(),
    packageManager: packageManagerSchema.optional(),
    postSteps: z.array(postStepSchema).optional().meta({
      description: 'Scripts to run after the dependencies are installed, in this order.',
    }),
  })
  .refine(
    (manifest) => manifest.category === undefined || manifest.selectedByDefault === undefined,
    {
      message: 'A plugin in a category takes its default from the category',
      path: ['selectedByDefault'],
    },
  )
  .refine((manifest) => manifest.category === undefined || manifest.section === undefined, {
    message: 'A plugin in a category takes its section from the category',
    path: ['section'],
  })
  .refine(
    (manifest) =>
      (manifest.category === PACKAGE_MANAGER_CATEGORY) === (manifest.packageManager !== undefined),
    {
      message: `A plugin in the ${PACKAGE_MANAGER_CATEGORY} category describes its package manager, no other plugin does`,
      path: ['packageManager'],
    },
  )
  .refine(
    ({ packageManager, files }) =>
      packageManager === undefined ||
      packageManager.allowedBuildsIn.startsWith(PACKAGE_JSON_FIELD_PREFIX) ||
      (files ?? []).some(
        (file) =>
          file.target === packageManager.allowedBuildsIn &&
          file.when === undefined &&
          file.root !== 'source',
      ),
    {
      message:
        'A file that holds the allowed builds is a file of this plugin that is always written to the project root',
      path: ['packageManager', 'allowedBuildsIn'],
    },
  )
  .meta({ title: 'next-suite plugin manifest' })

/** The manifest of a plugin as its author writes it in `plugin.json`. */
export type PluginManifest = z.input<typeof pluginManifestSchema>

/** A validated manifest, with defaults such as a file's conflict strategy filled in. */
export type ParsedPluginManifest = z.output<typeof pluginManifestSchema>
