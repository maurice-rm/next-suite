import * as z from 'zod'

import { contributionsSchema } from './contributions.ts'
import { conflictStrategySchema, fileRootSchema } from './plugin-file.ts'

type Value = string | number | boolean | readonly string[]

/** What a logic module knows about the run it computes for. */
export type LogicContext = {
  project: {
    /** The package name, such as `my-app`. */
    name: string
    /** The command of the package manager, such as `pnpm`. */
    packageManager: string
    /** What an import through the project's alias starts with, such as `@/`. */
    importPrefix: string
  }
  /** The answers to this plugin's options, by option name. */
  options: Readonly<Record<string, Value>>
  /** The base settings, such as `src-dir`. */
  settings: Readonly<Record<string, Value>>
  /** The names of the selected plugins. */
  plugins: readonly string[]
  /** Whether a named fact holds, such as `plugin:prettier`, `category:orm` or a plugin's own fact. */
  has: (fact: string) => boolean
}

const fileSchema = z.strictObject({
  target: z.string().min(1),
  content: z.string(),
  root: fileRootSchema,
  conflict: conflictStrategySchema,
})

/** What a logic module answers: files with computed content and contributions like the manifest's. */
export const logicResultSchema = z.strictObject({
  files: z.array(fileSchema).optional(),
  contributes: contributionsSchema.optional(),
  dependencies: z.record(z.string().min(1), z.string().min(1)).optional(),
  devDependencies: z.record(z.string().min(1), z.string().min(1)).optional(),
})

/** What a logic module answers, as its author writes it. */
export type LogicResult = z.input<typeof logicResultSchema>

/**
 * The default export of a plugin's logic module: computes files and contributions from the
 * context. It must not write files, start processes or use the network; the core does that.
 */
export type Logic = (context: LogicContext) => LogicResult | Promise<LogicResult>
