import * as z from 'zod'

import { conditionSchema } from './condition.ts'
import { scriptName } from './identifiers.ts'

const RESERVED_PACKAGE_FIELDS: ReadonlySet<string> = new Set([
  'name',
  'scripts',
  'dependencies',
  'devDependencies',
  'packageManager',
  'devEngines',
  'allowScripts',
  'dependenciesMeta',
  'trustedDependencies',
])

const nonEmpty = z.string().min(1)

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
  readme: z
    .array(z.strictObject({ section: nonEmpty, text: nonEmpty }))
    .optional()
    .meta({ description: 'Sections of README.md.' }),
  nextConfig: z
    .strictObject({
      imports: z.array(nonEmpty).optional(),
      options: z.array(z.strictObject({ key: nonEmpty, value: nonEmpty })).optional(),
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
  rootProviders: z
    .array(z.strictObject({ import: nonEmpty, component: nonEmpty }))
    .optional()
    .meta({ description: 'Provider components around the children of the root layout.' }),
})
