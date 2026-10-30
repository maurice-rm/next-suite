import semver from 'semver'
import * as z from 'zod'

import {
  allowedBuildsLocationSchema,
  PACKAGE_JSON_FIELD_PREFIX,
} from './allowed-builds-location.ts'
import { type Condition, conditionSchema } from './condition.ts'
import { type Contributions, contributionsSchema } from './contributions.ts'
import { type Dependencies, dependenciesSchema } from './dependencies.ts'
import { kebabCaseId, pluginName } from './identifiers.ts'
import { type PluginFile, pluginFileSchema } from './plugin-file.ts'
import { type PluginOption, pluginOptionSchema } from './plugin-option.ts'
import { type PostStep, postStepSchema } from './post-step.ts'
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

/** A condition for a plugin, with the reason the wizard shows. */
export type PluginRule = {
  /** The condition on the answers. */
  when: Condition
  /** Why the rule exists, shown when it rules the plugin out, such as "Needs a database". */
  reason: string
}

/** An environment variable a plugin needs, listed in .env.example and the env schema. */
export type EnvVariable = {
  /** The name in upper case, such as `DATABASE_URL`; a client variable starts with `NEXT_PUBLIC_`. */
  name: string
  /** `server` for a variable only the server reads, `client` for one the browser reads too. */
  scope: 'server' | 'client'
  /** Whether the value is a secret, such as a password or an API key. */
  secret: boolean
  /** The value .env.example shows. */
  example: string
  /** What the variable is for, shown above it in .env.example. */
  description: string
  /** The value when the variable is not set; without one the variable is required. */
  default?: string | undefined
}

/**
 * How the core uses a package manager; the plugin name is its command. Only for plugins in the
 * package-manager category.
 */
export type PackageManagerAdapter = {
  /** The version written to `packageManager` in package.json, exact or `catalog:<name>`. */
  version: string
  /** The arguments of a CI install that keeps the lockfile as it is, such as `["ci"]` for npm. */
  ciInstallArgs: string[]
  /**
   * The arguments of the first install, such as `["install", "--no-immutable"]` for Yarn, which
   * forbids creating a lockfile in CI otherwise; `["install"]` by default.
   */
  installArgs?: string[] | undefined
  /**
   * What a project asks for when it runs with another version, through
   * `devEngines.packageManager`: `download` the version, `warn` or stop with an `error`.
   */
  whenVersionDiffers: 'download' | 'warn' | 'error'
  /**
   * Where the allowed dependency builds go: a package.json field such as
   * `package.json#allowScripts`, or the target of a file of this plugin that lists them itself.
   */
  allowedBuildsIn: string
}

/** Dependencies a plugin adds only when a condition holds. */
export type ConditionalDependencies = {
  /** Adds the dependencies only when this condition holds. */
  when: Condition
  /** Dependencies of the project. */
  dependencies?: Dependencies | undefined
  /** Dev dependencies of the project. */
  devDependencies?: Dependencies | undefined
}

/** Contributions a plugin adds only when a condition holds. */
export type ConditionalContributions = {
  /** Adds the contributions only when this condition holds. */
  when: Condition
  /** The contributions. */
  contributes: Contributions
}

/**
 * The manifest of a plugin as its author writes it in `plugin.json`: what the plugin is, asks and
 * contributes.
 */
export type PluginManifest = {
  /** The JSON schema of the manifest, for completion in an editor. */
  // biome-ignore lint/style/useNamingConvention: JSON Schema fixes the name of this key
  $schema?: string | undefined
  /** The name, also the flag of a plugin without a category. */
  name: string
  /** The version of the plugin itself, recorded in next-suite.json. */
  version: string
  /** The versions of the plugin contract this plugin works with, as a semver range. */
  contract: string
  /** The name the wizard shows. */
  title: string
  /** What the plugin does, in one sentence. */
  description: string
  /** The category whose question offers this plugin, such as `orm`. */
  category?: string | undefined
  /** The section of the wizard the question belongs to; only for plugins without a category. */
  section?: string | undefined
  /** Whether `--yes` selects this plugin; only for plugins without a category. */
  selectedByDefault?: boolean | undefined
  /** Further questions by option name, each with a default and a flag `--<plugin>-<option>`. */
  options?: Record<string, PluginOption> | undefined
  /** Conditions that must hold for this plugin, each with a reason. */
  requires?: PluginRule[] | undefined
  /** Conditions under which this plugin cannot be used, each with a reason. */
  conflicts?: PluginRule[] | undefined
  /** Dependencies of the project. */
  dependencies?: Dependencies | undefined
  /** Dev dependencies of the project. */
  devDependencies?: Dependencies | undefined
  /**
   * Dependencies added only when a condition holds, such as a Prettier plugin when Prettier is
   * selected.
   */
  conditionalDependencies?: ConditionalDependencies[] | undefined
  /** Environment variables the plugin needs, listed in .env.example and the env schema. */
  env?: EnvVariable[] | undefined
  /** Files from the plugin directory; a source ending in `.hbs` is a template. */
  files?: PluginFile[] | undefined
  /** Named conditions templates and logic modules ask through `has` as `fact:<name>`. */
  facts?: Record<string, Condition> | undefined
  /** Entries for the files several plugins share, the composition points. */
  contributes?: Contributions | undefined
  /**
   * Contributions added only when a condition holds, such as an option for when no plugin of a
   * category is selected.
   */
  conditionalContributions?: ConditionalContributions[] | undefined
  /**
   * The logic module in the plugin directory, such as `logic.ts`: computes files and contributions
   * from the answers. TypeScript must run by stripping types.
   */
  logic?: string | undefined
  /**
   * How the core uses this package manager; the plugin name is its command. Only for plugins in
   * the package-manager category.
   */
  packageManager?: PackageManagerAdapter | undefined
  /** Scripts to run after the dependencies are installed, in this order. */
  postSteps?: PostStep[] | undefined
}

const ruleSchema = z
  .strictObject({
    when: conditionSchema.meta({ description: 'The condition on the answers.' }),
    reason: z.string().min(1).meta({
      description:
        'Why the rule exists, shown when it rules the plugin out, such as "Needs a database".',
    }),
  })
  .meta({
    id: 'PluginRule',
    description: 'A condition for a plugin, with the reason the wizard shows.',
  })

const envVariableSchema = z
  .strictObject({
    name: z.string().regex(ENV_NAME, 'Use upper case, such as `DATABASE_URL`').meta({
      description:
        'The name in upper case, such as `DATABASE_URL`; a client variable starts with `NEXT_PUBLIC_`.',
    }),
    scope: z.enum(['server', 'client']).meta({
      description:
        '`server` for a variable only the server reads, `client` for one the browser reads too.',
    }),
    secret: z
      .boolean()
      .meta({ description: 'Whether the value is a secret, such as a password or an API key.' }),
    example: z.string().meta({ description: 'The value .env.example shows.' }),
    description: z
      .string()
      .min(1)
      .meta({ description: 'What the variable is for, shown above it in .env.example.' }),
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
  .meta({
    id: 'EnvVariable',
    description:
      'An environment variable a plugin needs, listed in .env.example and the env schema.',
  })

const packageManagerSchema = z
  .strictObject({
    version: exactVersionSpec.meta({
      description:
        'The version written to `packageManager` in package.json, exact or `catalog:<name>`.',
    }),
    ciInstallArgs: z.array(z.string().min(1)).min(1).meta({
      description:
        'The arguments of a CI install that keeps the lockfile as it is, such as `["ci"]` for npm.',
    }),
    installArgs: z.array(z.string().min(1)).min(1).default(['install']).meta({
      description:
        'The arguments of the first install, such as `["install", "--no-immutable"]` for Yarn, which forbids creating a lockfile in CI otherwise; `["install"]` by default.',
    }),
    whenVersionDiffers: z.enum(['download', 'warn', 'error']).meta({
      description:
        'What a project asks for when it runs with another version, through `devEngines.packageManager`: `download` the version, `warn` or stop with an `error`.',
    }),
    allowedBuildsIn: allowedBuildsLocationSchema.meta({
      description:
        'Where the allowed dependency builds go: a package.json field such as `package.json#allowScripts`, or the target of a file of this plugin that lists them itself.',
    }),
  })
  .meta({
    id: 'PackageManagerAdapter',
    description:
      'How the core uses a package manager; the plugin name is its command. Only for plugins in the package-manager category.',
  })

const conditionalDependenciesSchema = z
  .strictObject({
    when: conditionSchema.meta({
      description: 'Adds the dependencies only when this condition holds.',
    }),
    dependencies: dependenciesSchema
      .optional()
      .meta({ description: 'Dependencies of the project.' }),
    devDependencies: dependenciesSchema
      .optional()
      .meta({ description: 'Dev dependencies of the project.' }),
  })
  .meta({
    id: 'ConditionalDependencies',
    description: 'Dependencies a plugin adds only when a condition holds.',
  })

const conditionalContributionsSchema = z
  .strictObject({
    when: conditionSchema.meta({
      description: 'Adds the contributions only when this condition holds.',
    }),
    contributes: contributionsSchema.meta({ description: 'The contributions.' }),
  })
  .meta({
    id: 'ConditionalContributions',
    description: 'Contributions a plugin adds only when a condition holds.',
  })

export const pluginManifestSchema = z
  .strictObject({
    // biome-ignore lint/style/useNamingConvention: JSON Schema fixes the name of this key
    $schema: z
      .string()
      .optional()
      .meta({ description: 'The JSON schema of the manifest, for completion in an editor.' }),
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
      .meta({
        description:
          'The versions of the plugin contract this plugin works with, as a semver range.',
      }),
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
      description:
        'Further questions by option name, each with a default and a flag `--<plugin>-<option>`.',
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
      .meta({ description: 'Dependencies of the project.' }),
    devDependencies: dependenciesSchema
      .optional()
      .meta({ description: 'Dev dependencies of the project.' }),
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
    facts: z.record(kebabCaseId, conditionSchema).optional().meta({
      description:
        'Named conditions templates and logic modules ask through `has` as `fact:<name>`.',
    }),
    contributes: contributionsSchema.optional().meta({
      description: 'Entries for the files several plugins share, the composition points.',
    }),
    conditionalContributions: z.array(conditionalContributionsSchema).optional().meta({
      description:
        'Contributions added only when a condition holds, such as an option for when no plugin of a category is selected.',
    }),
    logic: z.string().min(1).optional().meta({
      description:
        'The logic module in the plugin directory, such as `logic.ts`: computes files and contributions from the answers. TypeScript must run by stripping types.',
    }),
    packageManager: packageManagerSchema.optional().meta({
      description:
        'How the core uses this package manager; the plugin name is its command. Only for plugins in the package-manager category.',
    }),
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
  .meta({
    title: 'next-suite plugin manifest',
    description:
      'The manifest of a plugin as its author writes it in `plugin.json`: what the plugin is, asks and contributes.',
  })

/** A validated manifest, with defaults such as a file's conflict strategy filled in. */
export type ParsedPluginManifest = z.output<typeof pluginManifestSchema>
