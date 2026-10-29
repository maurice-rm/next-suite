import * as z from 'zod'

import { kebabCaseId, pluginName } from './identifiers.ts'

const categoryFields = {
  id: kebabCaseId,
  question: z.string().min(1),
}

/**
 * A group of plugins answering one question in the wizard. `one` needs exactly one plugin,
 * `at-most-one` allows none, `many` allows any number.
 */
const categorySchema = z.discriminatedUnion('cardinality', [
  z.strictObject({ ...categoryFields, cardinality: z.literal('one'), default: pluginName }),
  z.strictObject({
    ...categoryFields,
    cardinality: z.literal('at-most-one'),
    default: pluginName.nullable(),
  }),
  z.strictObject({
    ...categoryFields,
    cardinality: z.literal('many'),
    default: z.array(pluginName),
  }),
])

/** The categories of a plugin collection, in the order the wizard asks them. */
export const categoriesSchema = z
  .array(categorySchema)
  .refine(
    (categories) => new Set(categories.map((category) => category.id)).size === categories.length,
    {
      message: 'Each category id appears once',
    },
  )
  .meta({ title: 'next-suite plugin categories' })

/** A group of plugins answering one question in the wizard, with its cardinality and default. */
export type Category = z.input<typeof categorySchema>
