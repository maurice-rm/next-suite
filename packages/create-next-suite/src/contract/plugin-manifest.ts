import semver from 'semver'
import * as z from 'zod'

import {
  allowedBuildsLocationSchema,
  PACKAGE_JSON_FIELD_PREFIX,
} from './allowed-builds-location.ts'
import { conditionSchema } from './condition.ts'
import { contributionsSchema } from './contributions.ts'
import { dependenciesSchema } from './dependencies.ts'
import { kebabCaseId, pluginName } from './identifiers.ts'
import { conflictStrategySchema, fileRootSchema } from './plugin-file.ts'
import { pluginOptionSchema } from './plugin-option.ts'
import { postStepSchema } from './post-step.ts'
import { exactVersionSpec } from './version-spec.ts'

/**
 * The version of the plugin contract this release of create-next-suite implements. A plugin's
 * `contract` range is checked against it before the plugin loads.
 */
export const CONTRACT_VERSION = '1.0.0'

/** The category of the package manager plugins; each of them fills the package manager adapter. */
export const PACKAGE_MANAGER_CATEGORY = 'package-manager'

const CLIENT_ENV_PREFIX = 'NEXT_PUBLIC_'
const ENV_NAME = /^[A-Z][A-Z0-9_]*$/

const ruleSchema = z.strictObject({
  when: conditionSchema,
  reason: z.string().min(1),
})

const envVariableSchema = z
  .strictObject({
    name: z.string().regex(ENV_NAME, 'Use upper case, such as `DATABASE_URL`'),
    scope: z.enum(['server', 'client']),
    secret: z.boolean(),
    example: z.string(),
    description: z.string().min(1),
    default: z.string().optional().meta({
      description: 'The value when the variable is not set; without one the variable is required.',
    }),
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
      'A path in the plugin directory; a source ending in `.hbs` is rendered as a template, any other is copied as it is.',
  }),
  target: z.string().min(1),
  when: conditionSchema.optional(),
  conflict: conflictStrategySchema,
  root: fileRootSchema.meta({
    description: '`source` places the target under src/ when the project uses a src directory.',
  }),
})

const packageManagerSchema = z
  .strictObject({
    version: exactVersionSpec.meta({
      description: 'The version written to `packageManager` in package.json.',
    }),
    ciInstallArgs: z.array(z.string().min(1)).min(1).meta({
      description:
        'The arguments of a CI install that keeps the lockfile as it is, such as `["ci"]` for npm.',
    }),
    installArgs: z.array(z.string().min(1)).min(1).default(['install']).meta({
      description:
        'The arguments of the first install, such as `["install", "--no-immutable"]` for Yarn, which forbids creating a lockfile in CI otherwise.',
    }),
    whenVersionDiffers: z.enum(['download', 'warn', 'error']).meta({
      description:
        'What a project asks for when it runs with another version, through `devEngines.packageManager`.',
    }),
    allowedBuildsIn: allowedBuildsLocationSchema.meta({
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

const conditionalContributionsSchema = z.strictObject({
  when: conditionSchema,
  contributes: contributionsSchema,
})

/** The manifest of a plugin, read from its `plugin.json`. */
export const pluginManifestSchema = z
  .strictObject({
    // biome-ignore lint/style/useNamingConvention: JSON Schema fixes the name of this key
    $schema: z.string().optional(),
    name: pluginName.meta({
      description: 'The name, also the flag of a plugin without a category.',
    }),
    version: z
      .string()
      .refine((value) => semver.valid(value) !== null, 'Use a semver version')
      .meta({ description: 'The version of the plugin itself, recorded in next-suite.json.' }),
    contract: z
      .string()
      .refine((value) => semver.validRange(value) !== null, 'Use a semver range')
      .meta({ description: 'The versions of the plugin contract this plugin works with.' }),
    title: z.string().min(1).meta({ description: 'The name the wizard shows.' }),
    description: z.string().min(1).meta({ description: 'What the plugin does, in one sentence.' }),
    category: kebabCaseId
      .optional()
      .meta({ description: 'The category whose question offers this plugin, such as `orm`.' }),
    section: z.string().min(1).optional().meta({
      description:
        'The section of the wizard the question belongs to; only for plugins without a category.',
    }),
    selectedByDefault: z.boolean().optional().meta({
      description: 'Whether `--yes` selects this plugin; only for plugins without a category.',
    }),
    options: z.record(kebabCaseId, pluginOptionSchema).optional().meta({
      description: 'Further questions, each with a default and a flag `--<plugin>-<option>`.',
    }),
    requires: z
      .array(ruleSchema)
      .optional()
      .meta({ description: 'Conditions that must hold for this plugin, each with a reason.' }),
    conflicts: z.array(ruleSchema).optional().meta({
      description: 'Conditions under which this plugin cannot be used, each with a reason.',
    }),
    dependencies: dependenciesSchema
      .optional()
      .meta({ description: 'Dependencies of the project: `catalog:<name>` or a semver range.' }),
    devDependencies: dependenciesSchema.optional().meta({
      description: 'Dev dependencies of the project: `catalog:<name>` or a semver range.',
    }),
    conditionalDependencies: z.array(conditionalDependenciesSchema).optional().meta({
      description:
        'Dependencies added only when a condition holds, such as a Prettier plugin when Prettier is selected.',
    }),
    env: z.array(envVariableSchema).optional().meta({
      description:
        'Environment variables the plugin needs, listed in .env.example and the env schema.',
    }),
    files: z.array(pluginFileSchema).optional().meta({
      description: 'Files from the plugin directory; a source ending in `.hbs` is a template.',
    }),
    facts: z
      .record(kebabCaseId, conditionSchema)
      .optional()
      .meta({ description: 'Named conditions templates and logic modules ask through `has`.' }),
    contributes: contributionsSchema.optional().meta({
      description: 'Entries for the files several plugins share; see the composition points.',
    }),
    conditionalContributions: z.array(conditionalContributionsSchema).optional().meta({
      description:
        'Contributions added only when a condition holds, such as an option for when no plugin of a category is selected.',
    }),
    logic: z.string().min(1).optional().meta({
      description:
        'The logic module in the plugin directory, such as `logic.ts`: computes files and contributions from the answers. TypeScript must run by stripping types.',
    }),
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
