import * as z from 'zod'

const SCRIPT_NAME = /^[a-z][a-z0-9:-]*$/
const RESERVED_PACKAGE_FIELDS: ReadonlySet<string> = new Set([
  'name',
  'scripts',
  'dependencies',
  'devDependencies',
])

const nonEmpty = z.string().min(1)

/**
 * What a plugin adds to the files several plugins share. The core merges the entries of all
 * plugins by a fixed rule per composition point; plugins never write these files themselves.
 */
export const contributionsSchema = z.strictObject({
  package: z
    .strictObject({
      scripts: z
        .record(z.string().regex(SCRIPT_NAME, 'Use a script name such as `db:migrate`'), nonEmpty)
        .optional(),
      fields: z
        .record(
          nonEmpty.refine((field) => !RESERVED_PACKAGE_FIELDS.has(field), {
            message:
              'The core writes name, scripts and dependencies; use `scripts` and the manifest fields',
          }),
          z.json(),
        )
        .optional(),
    })
    .optional()
    .meta({ description: 'Scripts and top-level fields of package.json.' }),
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
  rootProviders: z
    .array(z.strictObject({ import: nonEmpty, component: nonEmpty }))
    .optional()
    .meta({ description: 'Provider components around the children of the root layout.' }),
})
