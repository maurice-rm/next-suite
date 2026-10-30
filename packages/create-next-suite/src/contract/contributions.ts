import * as z from 'zod'

import { PACKAGE_JSON_BUILD_FIELDS } from './allowed-builds-location.ts'
import { conditionSchema } from './condition.ts'
import { scriptName } from './identifiers.ts'

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

/** A module and one of its exports; a module starting with `#src/` is imported through the project's alias. */
const moduleExportSchema = z.strictObject({
  module: nonEmpty.meta({
    description: 'Such as `#src/lib/logger`, imported through the project alias.',
  }),
  export: nonEmpty.optional(),
})

const namedModuleExportSchema = moduleExportSchema.required({ export: true })

export type ModuleExport = z.output<typeof moduleExportSchema>
export type NamedModuleExport = z.output<typeof namedModuleExportSchema>

/** A section of a Markdown file several plugins write, such as README.md. */
const sectionTextSchema = z.strictObject({ section: nonEmpty, text: nonEmpty })

/** A key with its value written as code, such as a field of an object literal. */
const codeEntrySchema = z.strictObject({ key: nonEmpty, value: nonEmpty })

/**
 * What a plugin adds to the files several plugins share. The core merges the entries of all
 * plugins by a fixed rule per composition point; plugins never write these files themselves.
 */
export const contributionsSchema = z.strictObject({
  package: z
    .strictObject({
      scripts: z.record(scriptName, nonEmpty).optional(),
      fields: z
        .record(
          nonEmpty.refine((field) => !RESERVED_PACKAGE_FIELDS.has(field), {
            message:
              'The core writes name, scripts, dependencies and the package manager fields; use `scripts`, the manifest fields and `allowedBuilds`',
          }),
          z.json(),
        )
        .optional(),
    })
    .optional()
    .meta({ description: 'Scripts and top-level fields of package.json.' }),
  allowedBuilds: z.array(nonEmpty).optional().meta({
    description:
      'Dependencies whose install scripts may run; the package manager plugin writes them where its manager reads them.',
  }),
  gitignore: z.array(nonEmpty).optional().meta({ description: 'Patterns for .gitignore.' }),
  readme: z.array(sectionTextSchema).optional().meta({ description: 'Sections of README.md.' }),
  nextConfig: z
    .strictObject({
      imports: z.array(nonEmpty).optional(),
      options: z.array(codeEntrySchema).optional(),
      wrappers: z.array(z.strictObject({ import: nonEmpty, call: nonEmpty })).optional(),
    })
    .optional()
    .meta({ description: 'Imports, configuration options and wrappers of next.config.ts.' }),
  deniedBuilds: z.array(nonEmpty).optional().meta({
    description:
      'Dependencies whose install scripts are known to be unneeded, such as a fallback for prebuilt binaries; the package manager records them as denied, so a strict install does not stop on them.',
  }),
  cssImports: z.array(nonEmpty).optional().meta({
    description: 'Stylesheets the global CSS imports first, such as `tailwindcss`.',
  }),
  prettierPlugins: z.array(nonEmpty).optional().meta({
    description: 'Plugins the Prettier configuration loads, such as `prettier-plugin-tailwindcss`.',
  }),
  lintStaged: z
    .array(z.strictObject({ glob: nonEmpty, command: nonEmpty }))
    .optional()
    .meta({
      description:
        'Commands lint-staged runs on staged files that match a glob, such as `eslint --fix` for `*.ts`.',
    }),
  ciChecks: z.array(scriptName).optional().meta({
    description:
      'Scripts the CI workflow runs as checks, such as `lint`; `build` always runs last.',
  }),
  agents: z
    .array(sectionTextSchema)
    .optional()
    .meta({ description: 'Sections of AGENTS.md, the instructions for coding agents.' }),
  stack: z.array(nonEmpty).optional().meta({
    description: 'Names for the stack line at the end of a run, such as "Tailwind".',
  }),
  nextSteps: z
    .array(
      z.union([
        z.strictObject({ command: nonEmpty, when: conditionSchema.optional() }),
        z.strictObject({ script: scriptName, when: conditionSchema.optional() }),
      ]),
    )
    .optional()
    .meta({
      description:
        'Commands the end of a run suggests: a plain `command`, or a `script` run with the package manager.',
    }),
  layoutMetadata: z.array(codeEntrySchema).optional().meta({
    description:
      'Fields of the `metadata` the root layout exports, such as `metadataBase`, with their value as code.',
  }),
  instrumentation: z
    .strictObject({
      register: z.array(moduleExportSchema).optional(),
      onRequestError: z.array(namedModuleExportSchema).optional(),
    })
    .optional()
    .meta({
      description:
        'Functions instrumentation.ts runs: at startup (`register`, the export is called without arguments, or the module is just loaded) and for every server error (`onRequestError`). Node.js runtime only.',
    }),
  instrumentationClient: z.array(moduleExportSchema).optional().meta({
    description: 'Functions instrumentation-client.ts calls in the browser before the app starts.',
  }),
  bodyEnd: z.array(namedModuleExportSchema).optional().meta({
    description: 'Components the root layout renders at the end of `body`, such as analytics.',
  }),
  tsconfig: z
    .strictObject({
      paths: z.record(nonEmpty, z.array(nonEmpty)).optional(),
      include: z.array(nonEmpty).optional(),
    })
    .optional()
    .meta({ description: 'Paths and includes of tsconfig.json; one target list per path.' }),
  generatedDirs: z.array(nonEmpty).optional().meta({
    description:
      'Directories of generated code, such as `src/generated`: ignored by git, the linter and Knip.',
  }),
  lint: z
    .strictObject({ ignores: z.array(nonEmpty).optional() })
    .optional()
    .meta({ description: 'Globs the linter ignores.' }),
  knip: z
    .strictObject({
      entry: z.array(nonEmpty).optional(),
      ignore: z.array(nonEmpty).optional(),
      ignoreDependencies: z.array(nonEmpty).optional(),
    })
    .optional()
    .meta({ description: 'Entry files, ignored files and dependencies Knip should not report.' }),
  container: z
    .strictObject({
      buildArgs: z.array(z.strictObject({ name: nonEmpty, description: nonEmpty })).optional(),
      env: z.array(z.strictObject({ name: nonEmpty, value: z.string() })).optional(),
      services: z
        .array(
          z.strictObject({
            name: nonEmpty,
            image: nonEmpty,
            ports: z.array(nonEmpty).optional(),
            environment: z.record(nonEmpty, z.string()).optional(),
            volumes: z.array(nonEmpty).optional(),
          }),
        )
        .optional(),
    })
    .optional()
    .meta({
      description:
        'Build arguments and runtime env of the Dockerfile, and services of compose.yaml; one service per name.',
    }),
  csp: z.record(nonEmpty, z.array(nonEmpty)).optional().meta({
    description:
      'Sources per Content Security Policy directive, such as `{ "img-src": ["https:"] }`.',
  }),
  health: z
    .array(z.strictObject({ name: nonEmpty, module: nonEmpty, export: nonEmpty }))
    .optional()
    .meta({
      description: 'Checks the health route runs; each export answers whether its service is up.',
    }),
  testSetup: z.array(nonEmpty).optional().meta({
    description: 'Setup files the test runner loads before the tests, such as `test/setup.ts`.',
  }),
  logRedact: z.array(nonEmpty).optional().meta({
    description: 'Paths the logger hides from its output, such as `req.headers.authorization`.',
  }),
  rootProviders: z
    .array(z.strictObject({ import: nonEmpty, component: nonEmpty }))
    .optional()
    .meta({ description: 'Provider components around the children of the root layout.' }),
})
