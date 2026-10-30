import * as z from 'zod'

import { PACKAGE_JSON_BUILD_FIELDS } from './allowed-builds-location.ts'
import { type Condition, conditionSchema } from './condition.ts'
import { scriptName } from './identifiers.ts'

/** A value JSON can hold. */
type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue }

/** A module and one of its exports. */
export type ModuleExport = {
  /**
   * The module, such as `#src/lib/logger`; a module starting with `#src/` is imported through the
   * project's alias.
   */
  module: string
  /** The export to use; without one, the module is only loaded. */
  export?: string | undefined
}

/** A module and the one of its exports to use. */
export type NamedModuleExport = {
  /**
   * The module, such as `#src/lib/logger`; a module starting with `#src/` is imported through the
   * project's alias.
   */
  module: string
  /** The export to use. */
  export: string
}

/** A section of a Markdown file several plugins write, such as README.md. */
export type SectionText = {
  /** The heading of the section. */
  section: string
  /** The Markdown under the heading. */
  text: string
}

/** A key with its value written as code, such as a field of an object literal. */
export type CodeEntry = {
  /** The key, such as `reactCompiler`. */
  key: string
  /** The value as TypeScript code, such as `true`. */
  value: string
}

/** A command the end of a run suggests: a plain `command`, or a `script` run with the package manager. */
export type NextStep =
  | {
      /** The command as the user types it, such as `docker compose up -d`. */
      command: string
      /** Suggests the command only when this condition holds. */
      when?: Condition | undefined
    }
  | {
      /** The script of package.json, run with the package manager, such as `db:migrate`. */
      script: string
      /** Suggests the script only when this condition holds. */
      when?: Condition | undefined
    }

/**
 * What a plugin adds to the files several plugins share, the composition points. The core merges
 * the entries of all plugins by a fixed rule per point; plugins never write these files themselves.
 */
export type Contributions = {
  /** Scripts and top-level fields of package.json. */
  package?:
    | {
        /** Scripts by name, such as `{ "db:migrate": "drizzle-kit migrate" }`; one value per name. */
        scripts?: Record<string, string> | undefined
        /**
         * Further top-level fields by name; one value per name. The core writes name, scripts,
         * dependencies and the package manager fields.
         */
        fields?: Record<string, JsonValue> | undefined
      }
    | undefined
  /**
   * Dependencies whose install scripts may run; the package manager plugin writes them where its
   * manager reads them.
   */
  allowedBuilds?: string[] | undefined
  /** Patterns for .gitignore. */
  gitignore?: string[] | undefined
  /** Sections of README.md, in plugin order. */
  readme?: SectionText[] | undefined
  /** Imports, configuration options and wrappers of next.config.ts. */
  nextConfig?:
    | {
        /** Import lines, such as `import { securityHeaders } from "./security-headers";`. */
        imports?: string[] | undefined
        /** Options of the configuration object; one value per key. */
        options?: CodeEntry[] | undefined
        /** Functions the exported configuration is passed through, nested in plugin order. */
        wrappers?:
          | {
              /** The import line of the function. */
              import: string
              /** The function to call with the configuration, such as `withSentryConfig`. */
              call: string
            }[]
          | undefined
      }
    | undefined
  /**
   * Dependencies whose install scripts are known to be unneeded, such as a fallback for prebuilt
   * binaries; the package manager records them as denied, so a strict install does not stop on
   * them.
   */
  deniedBuilds?: string[] | undefined
  /** Stylesheets the global CSS imports first, such as `tailwindcss`. */
  cssImports?: string[] | undefined
  /** Plugins the Prettier configuration loads, such as `prettier-plugin-tailwindcss`. */
  prettierPlugins?: string[] | undefined
  /** Commands lint-staged runs on staged files that match a glob, such as `eslint --fix` for `*.ts`. */
  lintStaged?:
    | {
        /** The files the command runs on, such as `*.ts`. */
        glob: string
        /** The command, such as `eslint --fix`. */
        command: string
      }[]
    | undefined
  /** Scripts the CI workflow runs as checks, such as `lint`; `build` always runs last. */
  ciChecks?: string[] | undefined
  /** Sections of AGENTS.md, the instructions for coding agents. */
  agents?: SectionText[] | undefined
  /** Names for the stack line at the end of a run, such as "Tailwind". */
  stack?: string[] | undefined
  /** Commands the end of a run suggests: a plain `command`, or a `script` run with the package manager. */
  nextSteps?: NextStep[] | undefined
  /**
   * Fields of the `metadata` the root layout exports, such as `metadataBase`, with their value as
   * code; one value per key.
   */
  layoutMetadata?: CodeEntry[] | undefined
  /** Functions instrumentation.ts runs, in the Node.js runtime only. */
  instrumentation?:
    | {
        /**
         * Functions called at startup without arguments; a module without an export is only
         * loaded.
         */
        register?: ModuleExport[] | undefined
        /** Functions called with every error the server reports. */
        onRequestError?: NamedModuleExport[] | undefined
      }
    | undefined
  /** Functions instrumentation-client.ts calls in the browser before the app starts. */
  instrumentationClient?: ModuleExport[] | undefined
  /** Components the root layout renders at the end of `body`, such as analytics. */
  bodyEnd?: NamedModuleExport[] | undefined
  /** Paths and includes of tsconfig.json. */
  tsconfig?:
    | {
        /** Target lists by import alias, such as `{ "#db/*": ["./db/*"] }`; one list per alias. */
        paths?: Record<string, string[]> | undefined
        /** Further files and globs the compiler includes. */
        include?: string[] | undefined
      }
    | undefined
  /**
   * Directories of generated code, such as `src/generated`: ignored by git, the linter and Knip.
   */
  generatedDirs?: string[] | undefined
  /** What the linter ignores. */
  lint?:
    | {
        /** Globs the linter ignores. */
        ignores?: string[] | undefined
      }
    | undefined
  /** Entry files, ignored files and dependencies Knip should not report. */
  knip?:
    | {
        /** Further entry files, such as `drizzle.config.ts`. */
        entry?: string[] | undefined
        /** Files Knip does not check. */
        ignore?: string[] | undefined
        /** Dependencies Knip does not report as unused. */
        ignoreDependencies?: string[] | undefined
      }
    | undefined
  /** Build arguments and runtime environment of the Dockerfile, and services of compose.yaml. */
  container?:
    | {
        /** Build arguments of the Dockerfile; one per name. */
        buildArgs?:
          | {
              /** The name, such as `SENTRY_AUTH_TOKEN`. */
              name: string
              /** What the argument is for. */
              description: string
            }[]
          | undefined
        /** Environment variables of the running container; one per name. */
        env?:
          | {
              /** The name, such as `PORT`. */
              name: string
              /** The value. */
              value: string
            }[]
          | undefined
        /** Services of compose.yaml; one per name, a service defined differently fails. */
        services?:
          | {
              /** The service name, such as `db`. */
              name: string
              /** The image, such as `postgres:18`. */
              image: string
              /** Published ports, such as `5432:5432`. */
              ports?: string[] | undefined
              /** Environment variables of the service by name. */
              environment?: Record<string, string> | undefined
              /** Volumes, such as `db-data:/var/lib/postgresql/data`. */
              volumes?: string[] | undefined
            }[]
          | undefined
      }
    | undefined
  /** Sources per Content Security Policy directive, such as `{ "img-src": ["https:"] }`. */
  csp?: Record<string, string[]> | undefined
  /** Checks the health route runs; each export answers whether its service is up. */
  health?:
    | {
        /** The name the health route reports the check under, such as `database`. */
        name: string
        /** The module of the check, such as `#src/db/health`. */
        module: string
        /** The export of the module that runs the check. */
        export: string
      }[]
    | undefined
  /** Setup files the test runner loads before the tests, such as `test/setup.ts`. */
  testSetup?: string[] | undefined
  /** Paths the logger hides from its output, such as `req.headers.authorization`. */
  logRedact?: string[] | undefined
  /** Provider components around the children of the root layout, in plugin order. */
  rootProviders?:
    | {
        /** The import line of the component. */
        import: string
        /** The component, such as `ThemeProvider`. */
        component: string
      }[]
    | undefined
}

const RESERVED_PACKAGE_FIELDS: ReadonlySet<string> = new Set([
  'name',
  'scripts',
  'dependencies',
  'devDependencies',
  'packageManager',
  'devEngines',
  ...PACKAGE_JSON_BUILD_FIELDS,
])

const nonEmpty = z.string().min(1)

const jsonValueSchema: z.ZodType<JsonValue, JsonValue> = z
  .union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(z.lazy(() => jsonValueSchema)),
    z.record(
      z.string(),
      z.lazy(() => jsonValueSchema),
    ),
  ])
  .meta({ id: 'JsonValue', description: 'A value JSON can hold.' })

const describedList = (description: string): z.ZodOptional<z.ZodArray<z.ZodString>> =>
  z.array(nonEmpty).optional().meta({ description })

const MODULE_DESCRIPTION =
  "The module, such as `#src/lib/logger`; a module starting with `#src/` is imported through the project's alias."

const moduleExportSchema = z
  .strictObject({
    module: nonEmpty.meta({ description: MODULE_DESCRIPTION }),
    export: nonEmpty.optional().meta({
      description: 'The export to use; without one, the module is only loaded.',
    }),
  })
  .meta({
    id: 'ModuleExport',
    description: 'A module and one of its exports.',
  })

const namedModuleExportSchema = z
  .strictObject({
    module: nonEmpty.meta({ description: MODULE_DESCRIPTION }),
    export: nonEmpty.meta({ description: 'The export to use.' }),
  })
  .meta({
    id: 'NamedModuleExport',
    description: 'A module and the one of its exports to use.',
  })

const sectionTextSchema = z
  .strictObject({
    section: nonEmpty.meta({ description: 'The heading of the section.' }),
    text: nonEmpty.meta({ description: 'The Markdown under the heading.' }),
  })
  .meta({
    id: 'SectionText',
    description: 'A section of a Markdown file several plugins write, such as README.md.',
  })

const codeEntrySchema = z
  .strictObject({
    key: nonEmpty.meta({ description: 'The key, such as `reactCompiler`.' }),
    value: nonEmpty.meta({
      description: 'The value as TypeScript code, such as `true`.',
    }),
  })
  .meta({
    id: 'CodeEntry',
    description: 'A key with its value written as code, such as a field of an object literal.',
  })

const nextStepSchema = z
  .union([
    z
      .strictObject({
        command: nonEmpty.meta({
          description: 'The command as the user types it, such as `docker compose up -d`.',
        }),
        when: conditionSchema.optional().meta({
          description: 'Suggests the command only when this condition holds.',
        }),
      })
      .meta({ description: 'A plain command.' }),
    z
      .strictObject({
        script: scriptName.meta({
          description:
            'The script of package.json, run with the package manager, such as `db:migrate`.',
        }),
        when: conditionSchema.optional().meta({
          description: 'Suggests the script only when this condition holds.',
        }),
      })
      .meta({ description: 'A script run with the package manager.' }),
  ])
  .meta({
    id: 'NextStep',
    description:
      'A command the end of a run suggests: a plain `command`, or a `script` run with the package manager.',
  })

const packageSchema = z.strictObject({
  scripts: z.record(scriptName, nonEmpty).optional().meta({
    description:
      'Scripts by name, such as `{ "db:migrate": "drizzle-kit migrate" }`; one value per name.',
  }),
  fields: z
    .record(
      nonEmpty.refine((field) => !RESERVED_PACKAGE_FIELDS.has(field), {
        message:
          'The core writes name, scripts, dependencies and the package manager fields; use `scripts`, the manifest fields and `allowedBuilds`',
      }),
      jsonValueSchema,
    )
    .optional()
    .meta({
      description:
        'Further top-level fields by name; one value per name. The core writes name, scripts, dependencies and the package manager fields.',
    }),
})

const nextConfigSchema = z.strictObject({
  imports: describedList(
    'Import lines, such as `import { securityHeaders } from "./security-headers";`.',
  ),
  options: z.array(codeEntrySchema).optional().meta({
    description: 'Options of the configuration object; one value per key.',
  }),
  wrappers: z
    .array(
      z.strictObject({
        import: nonEmpty.meta({
          description: 'The import line of the function.',
        }),
        call: nonEmpty.meta({
          description: 'The function to call with the configuration, such as `withSentryConfig`.',
        }),
      }),
    )
    .optional()
    .meta({
      description:
        'Functions the exported configuration is passed through, nested in plugin order.',
    }),
})

const lintStagedEntrySchema = z.strictObject({
  glob: nonEmpty.meta({
    description: 'The files the command runs on, such as `*.ts`.',
  }),
  command: nonEmpty.meta({
    description: 'The command, such as `eslint --fix`.',
  }),
})

const instrumentationSchema = z.strictObject({
  register: z.array(moduleExportSchema).optional().meta({
    description:
      'Functions called at startup without arguments; a module without an export is only loaded.',
  }),
  onRequestError: z.array(namedModuleExportSchema).optional().meta({
    description: 'Functions called with every error the server reports.',
  }),
})

const tsconfigSchema = z.strictObject({
  paths: z.record(nonEmpty, z.array(nonEmpty)).optional().meta({
    description:
      'Target lists by import alias, such as `{ "#db/*": ["./db/*"] }`; one list per alias.',
  }),
  include: describedList('Further files and globs the compiler includes.'),
})

const knipSchema = z.strictObject({
  entry: describedList('Further entry files, such as `drizzle.config.ts`.'),
  ignore: describedList('Files Knip does not check.'),
  ignoreDependencies: describedList('Dependencies Knip does not report as unused.'),
})

const containerServiceSchema = z.strictObject({
  name: nonEmpty.meta({ description: 'The service name, such as `db`.' }),
  image: nonEmpty.meta({ description: 'The image, such as `postgres:18`.' }),
  ports: describedList('Published ports, such as `5432:5432`.'),
  environment: z
    .record(nonEmpty, z.string())
    .optional()
    .meta({ description: 'Environment variables of the service by name.' }),
  volumes: describedList('Volumes, such as `db-data:/var/lib/postgresql/data`.'),
})

const containerSchema = z.strictObject({
  buildArgs: z
    .array(
      z.strictObject({
        name: nonEmpty.meta({
          description: 'The name, such as `SENTRY_AUTH_TOKEN`.',
        }),
        description: nonEmpty.meta({
          description: 'What the argument is for.',
        }),
      }),
    )
    .optional()
    .meta({ description: 'Build arguments of the Dockerfile; one per name.' }),
  env: z
    .array(
      z.strictObject({
        name: nonEmpty.meta({ description: 'The name, such as `PORT`.' }),
        value: z.string().meta({ description: 'The value.' }),
      }),
    )
    .optional()
    .meta({
      description: 'Environment variables of the running container; one per name.',
    }),
  services: z.array(containerServiceSchema).optional().meta({
    description: 'Services of compose.yaml; one per name, a service defined differently fails.',
  }),
})

const healthCheckSchema = z.strictObject({
  name: nonEmpty.meta({
    description: 'The name the health route reports the check under, such as `database`.',
  }),
  module: nonEmpty.meta({
    description: 'The module of the check, such as `#src/db/health`.',
  }),
  export: nonEmpty.meta({
    description: 'The export of the module that runs the check.',
  }),
})

const rootProviderSchema = z.strictObject({
  import: nonEmpty.meta({ description: 'The import line of the component.' }),
  component: nonEmpty.meta({
    description: 'The component, such as `ThemeProvider`.',
  }),
})

export const contributionsSchema = z
  .strictObject({
    package: packageSchema
      .optional()
      .meta({ description: 'Scripts and top-level fields of package.json.' }),
    allowedBuilds: describedList(
      'Dependencies whose install scripts may run; the package manager plugin writes them where its manager reads them.',
    ),
    gitignore: describedList('Patterns for .gitignore.'),
    readme: z
      .array(sectionTextSchema)
      .optional()
      .meta({ description: 'Sections of README.md, in plugin order.' }),
    nextConfig: nextConfigSchema.optional().meta({
      description: 'Imports, configuration options and wrappers of next.config.ts.',
    }),
    deniedBuilds: describedList(
      'Dependencies whose install scripts are known to be unneeded, such as a fallback for prebuilt binaries; the package manager records them as denied, so a strict install does not stop on them.',
    ),
    cssImports: describedList('Stylesheets the global CSS imports first, such as `tailwindcss`.'),
    prettierPlugins: describedList(
      'Plugins the Prettier configuration loads, such as `prettier-plugin-tailwindcss`.',
    ),
    lintStaged: z.array(lintStagedEntrySchema).optional().meta({
      description:
        'Commands lint-staged runs on staged files that match a glob, such as `eslint --fix` for `*.ts`.',
    }),
    ciChecks: z.array(scriptName).optional().meta({
      description:
        'Scripts the CI workflow runs as checks, such as `lint`; `build` always runs last.',
    }),
    agents: z.array(sectionTextSchema).optional().meta({
      description: 'Sections of AGENTS.md, the instructions for coding agents.',
    }),
    stack: describedList('Names for the stack line at the end of a run, such as "Tailwind".'),
    nextSteps: z.array(nextStepSchema).optional().meta({
      description:
        'Commands the end of a run suggests: a plain `command`, or a `script` run with the package manager.',
    }),
    layoutMetadata: z.array(codeEntrySchema).optional().meta({
      description:
        'Fields of the `metadata` the root layout exports, such as `metadataBase`, with their value as code; one value per key.',
    }),
    instrumentation: instrumentationSchema.optional().meta({
      description: 'Functions instrumentation.ts runs, in the Node.js runtime only.',
    }),
    instrumentationClient: z.array(moduleExportSchema).optional().meta({
      description:
        'Functions instrumentation-client.ts calls in the browser before the app starts.',
    }),
    bodyEnd: z.array(namedModuleExportSchema).optional().meta({
      description: 'Components the root layout renders at the end of `body`, such as analytics.',
    }),
    tsconfig: tsconfigSchema
      .optional()
      .meta({ description: 'Paths and includes of tsconfig.json.' }),
    generatedDirs: describedList(
      'Directories of generated code, such as `src/generated`: ignored by git, the linter and Knip.',
    ),
    lint: z
      .strictObject({ ignores: describedList('Globs the linter ignores.') })
      .optional()
      .meta({ description: 'What the linter ignores.' }),
    knip: knipSchema.optional().meta({
      description: 'Entry files, ignored files and dependencies Knip should not report.',
    }),
    container: containerSchema.optional().meta({
      description:
        'Build arguments and runtime environment of the Dockerfile, and services of compose.yaml.',
    }),
    csp: z.record(nonEmpty, z.array(nonEmpty)).optional().meta({
      description:
        'Sources per Content Security Policy directive, such as `{ "img-src": ["https:"] }`.',
    }),
    health: z.array(healthCheckSchema).optional().meta({
      description: 'Checks the health route runs; each export answers whether its service is up.',
    }),
    testSetup: describedList(
      'Setup files the test runner loads before the tests, such as `test/setup.ts`.',
    ),
    logRedact: describedList(
      'Paths the logger hides from its output, such as `req.headers.authorization`.',
    ),
    rootProviders: z.array(rootProviderSchema).optional().meta({
      description: 'Provider components around the children of the root layout, in plugin order.',
    }),
  })
  .meta({
    id: 'Contributions',
    description:
      'What a plugin adds to the files several plugins share, the composition points. The core merges the entries of all plugins by a fixed rule per point; plugins never write these files themselves.',
  })
