import * as z from 'zod'

import { kebabCaseId, pluginName } from './identifiers.ts'

const categoryFields = {
  id: kebabCaseId,
  question: z.string().min(1),
  order: z.array(pluginName).optional().meta({
    description:
      'The plugins of the category in the order the wizard lists them; plugins not listed follow in the order they load, which is by directory name.',
  }),
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

const sectionSchema = z.strictObject({
  section: z.string().min(1).meta({ description: 'The section of the wizard, such as "Project".' }),
  categories: z.array(categorySchema).min(1),
})

const isUnique = (values: readonly string[]): boolean => new Set(values).size === values.length

/**
 * The categories of a plugin collection, grouped by the section of the wizard that asks them, in
 * the order the wizard asks them. Parsing gives each category the title of its section.
 */
export const categoriesSchema = z
  .array(sectionSchema)
  .refine((sections) => isUnique(sections.map(({ section }) => section)), {
    message: 'Each section appears once',
  })
  .refine(
    (sections) =>
      isUnique(sections.flatMap(({ categories }) => categories.map((category) => category.id))),
    { message: 'Each category id appears once' },
  )
  .transform((sections) =>
    sections.flatMap(({ section, categories }) =>
      categories.map((category) => ({ ...category, section })),
    ),
  )
  .meta({ title: 'next-suite plugin categories' })

/** A group of plugins answering one question in the wizard, with its section, cardinality and default. */
export type Category = z.output<typeof categoriesSchema>[number]
