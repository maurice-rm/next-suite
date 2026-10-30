import * as z from 'zod'

import { kebabCaseId, pluginName } from './identifiers.ts'

/** The fields every kind of category has. */
type CategoryFields = {
  /** The id in kebab-case, also the flag `--<id>`, such as `orm`. */
  id: string
  /** The question the wizard asks. */
  question: string
  /**
   * The plugins of the category in the order the wizard lists them; plugins not listed follow in
   * the order they load, which is by directory name.
   */
  order?: string[] | undefined
}

/** A category as categories.json lists it inside its section. */
export type ListedCategory = CategoryFields &
  (
    | {
        /** `one`: exactly one plugin of the category is selected. */
        cardinality: 'one'
        /** The plugin `--yes` selects. */
        default: string
      }
    | {
        /** `at-most-one`: one plugin of the category or none is selected. */
        cardinality: 'at-most-one'
        /** The plugin `--yes` selects, or `null` for none. */
        default: string | null
      }
    | {
        /** `many`: any number of plugins of the category is selected. */
        cardinality: 'many'
        /** The plugins `--yes` selects. */
        default: string[]
      }
  )

/** A section of the wizard with the categories it asks, in this order. */
export type CategorySection = {
  /** The section of the wizard, such as "Project". */
  section: string
  /** The categories the section asks; at least one. */
  categories: ListedCategory[]
}

/**
 * The content of categories.json: the categories of a plugin collection, grouped by the section of
 * the wizard that asks them, in the order the wizard asks them.
 */
export type CategoriesFile = CategorySection[]

/** A group of plugins answering one question in the wizard, with the section that asks it. */
export type Category = ListedCategory & {
  /** The section of the wizard that asks the category, such as "Project". */
  section: string
}

const categoryFields = {
  id: kebabCaseId.meta({
    description: 'The id in kebab-case, also the flag `--<id>`, such as `orm`.',
  }),
  question: z.string().min(1).meta({ description: 'The question the wizard asks.' }),
  order: z.array(pluginName).optional().meta({
    description:
      'The plugins of the category in the order the wizard lists them; plugins not listed follow in the order they load, which is by directory name.',
  }),
}

const listedCategorySchema = z
  .discriminatedUnion('cardinality', [
    z.strictObject({
      ...categoryFields,
      cardinality: z
        .literal('one')
        .meta({ description: '`one`: exactly one plugin of the category is selected.' }),
      default: pluginName.meta({ description: 'The plugin `--yes` selects.' }),
    }),
    z.strictObject({
      ...categoryFields,
      cardinality: z
        .literal('at-most-one')
        .meta({ description: '`at-most-one`: one plugin of the category or none is selected.' }),
      default: pluginName
        .nullable()
        .meta({ description: 'The plugin `--yes` selects, or `null` for none.' }),
    }),
    z.strictObject({
      ...categoryFields,
      cardinality: z
        .literal('many')
        .meta({ description: '`many`: any number of plugins of the category is selected.' }),
      default: z.array(pluginName).meta({ description: 'The plugins `--yes` selects.' }),
    }),
  ])
  .meta({
    id: 'ListedCategory',
    description: 'A category as categories.json lists it inside its section.',
  })

const categorySectionSchema = z
  .strictObject({
    section: z
      .string()
      .min(1)
      .meta({ description: 'The section of the wizard, such as "Project".' }),
    categories: z
      .array(listedCategorySchema)
      .min(1)
      .meta({ description: 'The categories the section asks; at least one.' }),
  })
  .meta({
    id: 'CategorySection',
    description: 'A section of the wizard with the categories it asks, in this order.',
  })

const isUnique = (values: readonly string[]): boolean => new Set(values).size === values.length

/** Parsing gives each category the section it is listed in. */
export const categoriesSchema = z
  .array(categorySectionSchema)
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
  .meta({
    title: 'next-suite plugin categories',
    description:
      'The content of categories.json: the categories of a plugin collection, grouped by the section of the wizard that asks them, in the order the wizard asks them.',
  })
