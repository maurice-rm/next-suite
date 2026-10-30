import * as z from 'zod'

import { type Condition, conditionSchema } from './condition.ts'

/**
 * What happens when the base project or another plugin already writes the same target: `error`
 * stops the run unless both contents are identical, `skip-if-exists` keeps the file written
 * first, `replace` overwrites it, which needs a `requires` rule on the plugin that wrote it.
 */
export type ConflictStrategy = 'error' | 'skip-if-exists' | 'replace'

/**
 * Where a target path starts: `project` at the project root, `source` under `src/` when the
 * project uses a src directory and at the project root otherwise.
 */
export type FileRoot = 'project' | 'source'

/** A file from the plugin directory. */
export type PluginFile = {
  /**
   * A path in the plugin directory; a source ending in `.hbs` is rendered as a template, any other
   * is copied as it is.
   */
  source: string
  /** The path in the project, relative to `root`. */
  target: string
  /** Writes the file only when this condition holds. */
  when?: Condition | undefined
  /**
   * What happens when the base project or another plugin already writes the same target; `error`
   * by default.
   */
  conflict?: ConflictStrategy | undefined
  /** Where `target` starts; `project` by default. */
  root?: FileRoot | undefined
}

export const conflictStrategySchema = z
  .enum(['error', 'skip-if-exists', 'replace'])
  .default('error')
  .meta({
    id: 'ConflictStrategy',
    description:
      'What happens when the base project or another plugin already writes the same target: `error` stops the run unless both contents are identical, `skip-if-exists` keeps the file written first, `replace` overwrites it, which needs a `requires` rule on the plugin that wrote it.',
  })

export const fileRootSchema = z.enum(['project', 'source']).default('project').meta({
  id: 'FileRoot',
  description:
    'Where a target path starts: `project` at the project root, `source` under `src/` when the project uses a src directory and at the project root otherwise.',
})

export const pluginFileSchema = z
  .strictObject({
    source: z.string().min(1).meta({
      description:
        'A path in the plugin directory; a source ending in `.hbs` is rendered as a template, any other is copied as it is.',
    }),
    target: z.string().min(1).meta({ description: 'The path in the project, relative to `root`.' }),
    when: conditionSchema
      .optional()
      .meta({ description: 'Writes the file only when this condition holds.' }),
    conflict: conflictStrategySchema,
    root: fileRootSchema,
  })
  .meta({ id: 'PluginFile', description: 'A file from the plugin directory.' })

const TEMPLATE_EXTENSION = '.hbs'

/** Whether a plugin file is a Handlebars template; every other source is copied as it is. */
export const isTemplateSource = (source: string): boolean => source.endsWith(TEMPLATE_EXTENSION)
