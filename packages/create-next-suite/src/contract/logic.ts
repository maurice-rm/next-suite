import * as z from 'zod'

import { type Contributions, contributionsSchema } from './contributions.ts'
import { type Dependencies, dependenciesSchema } from './dependencies.ts'
import {
  type ConflictStrategy,
  conflictStrategySchema,
  type FileRoot,
  fileRootSchema,
} from './plugin-file.ts'

/** A value a base setting or a plugin option can have. */
type AnswerValue = string | number | boolean | readonly string[]

/** What a logic module knows about the run it computes for. */
export type LogicContext = {
  /** The project being generated. */
  project: {
    /** The package name, such as `my-app`. */
    name: string
    /** The command of the package manager, such as `pnpm`. */
    packageManager: string
    /** What an import through the project's alias starts with, such as `@/`. */
    importPrefix: string
  }
  /** The answers to this plugin's options, by option name. */
  options: Readonly<Record<string, AnswerValue>>
  /** The base settings, such as `src-dir`. */
  settings: Readonly<Record<string, AnswerValue>>
  /** The names of the selected plugins. */
  plugins: readonly string[]
  /**
   * Whether a named fact holds: `plugin:<name>`, `category:<id>`, or `fact:<name>` for a fact a
   * plugin declares in `facts`.
   *
   * @throws Error when the fact is unknown, which stops the run.
   */
  has: (fact: string) => boolean
}

/** A file a logic module computed. */
export type LogicResultFile = {
  /** The path in the project, relative to `root`. */
  target: string
  /** The content of the file. */
  content: string
  /** Where `target` starts; `project` by default. */
  root?: FileRoot | undefined
  /**
   * What happens when the base project or another plugin already writes the same target; `error`
   * by default.
   */
  conflict?: ConflictStrategy | undefined
}

/**
 * What a logic module answers: files with computed content, and contributions and dependencies
 * like the manifest's. Its files get the same path checks and conflict rules as the plugin's files.
 */
export type LogicResult = {
  /** Files with computed content. */
  files?: LogicResultFile[] | undefined
  /** Entries for the files several plugins share, the composition points. */
  contributes?: Contributions | undefined
  /** Dependencies of the project. */
  dependencies?: Dependencies | undefined
  /** Dev dependencies of the project. */
  devDependencies?: Dependencies | undefined
}

/**
 * The default export of a plugin's logic module: computes files and contributions from the
 * context. It must not write files, start processes or use the network; the core does that.
 *
 * @param context - The project, the answers and the facts of the run.
 * @returns The files and contributions to add, also as a promise.
 *
 * @example
 * ```ts
 * import type { Logic } from 'create-next-suite/plugin'
 *
 * const logic: Logic = (context) => ({
 *   files: [
 *     {
 *       target: 'lib/site.ts',
 *       content: `export const site = ${JSON.stringify(context.project.name)}\n`,
 *       root: 'source',
 *     },
 *   ],
 *   contributes: { gitignore: context.has('plugin:prettier') ? ['/.cache'] : [] },
 * })
 *
 * export default logic
 * ```
 */
export type Logic = (context: LogicContext) => LogicResult | Promise<LogicResult>

const logicResultFileSchema = z.strictObject({
  target: z.string().min(1),
  content: z.string(),
  root: fileRootSchema,
  conflict: conflictStrategySchema,
})

export const logicResultSchema = z.strictObject({
  files: z.array(logicResultFileSchema).optional(),
  contributes: contributionsSchema.optional(),
  dependencies: dependenciesSchema.optional(),
  devDependencies: dependenciesSchema.optional(),
})
