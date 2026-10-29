import * as z from 'zod'

import { kebabCaseId, optionReference, pluginName } from './identifiers.ts'

const optionValue = z.union([z.string(), z.number(), z.boolean()])

/** A condition on the answers of a run, written as data. */
export const conditionSchema = z.union([
  z.strictObject({ plugin: pluginName }).meta({ description: 'The plugin is selected.' }),
  z
    .strictObject({ category: kebabCaseId })
    .meta({ description: 'A plugin of the category is selected.' }),
  z
    .strictObject({ setting: kebabCaseId, equals: optionValue })
    .meta({ description: 'A base setting has this value.' }),
  z
    .strictObject({ option: optionReference, equals: optionValue })
    .meta({ description: 'A plugin option has this value.' }),
  z
    .strictObject({ option: optionReference, in: z.array(optionValue).min(1) })
    .meta({ description: 'A plugin option has one of these values.' }),
  z.strictObject({
    get all(): z.ZodArray<typeof conditionSchema> {
      return z.array(conditionSchema).min(1)
    },
  }),
  z.strictObject({
    get any(): z.ZodArray<typeof conditionSchema> {
      return z.array(conditionSchema).min(1)
    },
  }),
  z.strictObject({
    get not(): typeof conditionSchema {
      return conditionSchema
    },
  }),
])

/**
 * A condition on the answers of a run: a plugin or category is selected, a setting or option has a
 * value, or a combination of conditions with `all`, `any` and `not`.
 */
export type Condition = z.input<typeof conditionSchema>
