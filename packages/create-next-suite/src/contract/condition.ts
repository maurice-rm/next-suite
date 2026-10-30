import * as z from 'zod'

import { kebabCaseId, optionReference, pluginName } from './identifiers.ts'

/** A value a base setting or a plugin option can have in a condition. */
type ConditionValue = string | number | boolean

/**
 * A condition on the answers of a run, written as data: a plugin or category is selected, a base
 * setting or a plugin option has a value, or a combination of conditions with `all`, `any` and
 * `not`.
 *
 * @example
 * ```ts
 * const condition: Condition = { all: [{ plugin: 'drizzle' }, { not: { category: 'auth' } }] }
 * ```
 */
export type Condition =
  | {
      /** Holds when this plugin is selected, such as `drizzle`. */
      plugin: string
    }
  | {
      /** Holds when a plugin of this category is selected, such as `orm`. */
      category: string
    }
  | {
      /** The base setting to compare, such as `src-dir`. */
      setting: string
      /** Holds when the base setting has this value. */
      equals: ConditionValue
    }
  | {
      /** The plugin option to compare, as `<plugin>.<option>`, such as `seo.og-image`. */
      option: string
      /** Holds when the option has this value. */
      equals: ConditionValue
    }
  | {
      /** The plugin option to compare, as `<plugin>.<option>`, such as `seo.og-image`. */
      option: string
      /** Holds when the option has one of these values; at least one. */
      in: ConditionValue[]
    }
  | {
      /** Holds when every one of these conditions holds; at least one. */
      all: Condition[]
    }
  | {
      /** Holds when at least one of these conditions holds; at least one. */
      any: Condition[]
    }
  | {
      /** Holds when this condition does not hold. */
      not: Condition
    }

const conditionValueSchema = z.union([z.string(), z.number(), z.boolean()])

const optionField = optionReference.meta({
  description: 'The plugin option to compare, as `<plugin>.<option>`, such as `seo.og-image`.',
})

export const conditionSchema = z
  .union([
    z
      .strictObject({
        plugin: pluginName.meta({
          description: 'Holds when this plugin is selected, such as `drizzle`.',
        }),
      })
      .meta({ description: 'A plugin is selected.' }),
    z
      .strictObject({
        category: kebabCaseId.meta({
          description: 'Holds when a plugin of this category is selected, such as `orm`.',
        }),
      })
      .meta({ description: 'A plugin of a category is selected.' }),
    z
      .strictObject({
        setting: kebabCaseId.meta({
          description: 'The base setting to compare, such as `src-dir`.',
        }),
        equals: conditionValueSchema.meta({
          description: 'Holds when the base setting has this value.',
        }),
      })
      .meta({ description: 'A base setting has a value.' }),
    z
      .strictObject({
        option: optionField,
        equals: conditionValueSchema.meta({
          description: 'Holds when the option has this value.',
        }),
      })
      .meta({ description: 'A plugin option has a value.' }),
    z
      .strictObject({
        option: optionField,
        in: z.array(conditionValueSchema).min(1).meta({
          description: 'Holds when the option has one of these values; at least one.',
        }),
      })
      .meta({ description: 'A plugin option has one of several values.' }),
    z
      .strictObject({
        get all(): z.ZodArray<typeof conditionSchema> {
          return z.array(conditionSchema).min(1).meta({
            description: 'Holds when every one of these conditions holds; at least one.',
          })
        },
      })
      .meta({ description: 'Every condition holds.' }),
    z
      .strictObject({
        get any(): z.ZodArray<typeof conditionSchema> {
          return z.array(conditionSchema).min(1).meta({
            description: 'Holds when at least one of these conditions holds; at least one.',
          })
        },
      })
      .meta({ description: 'At least one condition holds.' }),
    z
      .strictObject({
        get not(): typeof conditionSchema {
          return conditionSchema.meta({
            description: 'Holds when this condition does not hold.',
          })
        },
      })
      .meta({ id: 'NotCondition', description: 'A condition does not hold.' }),
  ])
  .meta({
    id: 'Condition',
    description:
      'A condition on the answers of a run: a plugin or category is selected, a base setting or a plugin option has a value, or a combination of conditions with `all`, `any` and `not`.',
  })
