import * as z from 'zod'

import { type Condition, conditionSchema } from './condition.ts'
import { kebabCaseId } from './identifiers.ts'

/** A choice of a `select` or `multiselect` option. */
export type OptionChoice = {
  /** The value the answers record, in kebab-case, such as `app-router`. */
  value: string
  /** The name the wizard shows. */
  label: string
  /** A description of the choice; the wizard shows it as the hint beside the label. */
  description?: string | undefined
}

/** The fields every kind of option has. */
type QuestionFields = {
  /** The question the wizard asks. */
  question: string
  /**
   * What the option sets, as a short statement such as "use the React Compiler"; the help of its
   * flag shows it.
   */
  description?: string | undefined
  /** Asks the option only when this condition holds. */
  when?: Condition | undefined
}

/**
 * A further question a plugin asks, with a flag `--<plugin>-<option>`. Every option has a
 * default, so `--yes` can answer it.
 */
export type PluginOption =
  | (QuestionFields & {
      /** A yes/no question. */
      type: 'boolean'
      /** The answer `--yes` takes. */
      default: boolean
    })
  | (QuestionFields & {
      /** A question answered with text. */
      type: 'string'
      /** The answer `--yes` takes. */
      default: string
    })
  | (QuestionFields & {
      /** A question answered with a number. */
      type: 'number'
      /** The answer `--yes` takes. */
      default: number
    })
  | (QuestionFields & {
      /** A question answered with one of the choices. */
      type: 'select'
      /** The choices; at least one. */
      choices: OptionChoice[]
      /** The value of the choice `--yes` takes. */
      default: string
    })
  | (QuestionFields & {
      /** A question answered with any number of the choices. */
      type: 'multiselect'
      /** The choices; at least one. */
      choices: OptionChoice[]
      /** The values of the choices `--yes` takes. */
      default: string[]
    })

const choiceSchema = z
  .strictObject({
    value: kebabCaseId.meta({
      description: 'The value the answers record, in kebab-case, such as `app-router`.',
    }),
    label: z.string().min(1).meta({ description: 'The name the wizard shows.' }),
    description: z.string().min(1).optional().meta({
      description: 'A description of the choice; the wizard shows it as the hint beside the label.',
    }),
  })
  .meta({
    id: 'OptionChoice',
    description: 'A choice of a `select` or `multiselect` option.',
  })

const questionFields = {
  question: z.string().min(1).meta({ description: 'The question the wizard asks.' }),
  description: z.string().min(1).optional().meta({
    description:
      'What the option sets, as a short statement such as "use the React Compiler"; the help of its flag shows it.',
  }),
  when: conditionSchema.optional().meta({
    description: 'Asks the option only when this condition holds.',
  }),
}

const DEFAULT_DESCRIPTION = 'The answer `--yes` takes.'

const choicesSchema = z
  .array(choiceSchema)
  .min(1)
  .meta({ description: 'The choices; at least one.' })

const hasChoice = (choices: { value: string }[], value: string): boolean =>
  choices.some((choice) => choice.value === value)

export const pluginOptionSchema = z
  .discriminatedUnion('type', [
    z.strictObject({
      type: z.literal('boolean').meta({ description: 'A yes/no question.' }),
      ...questionFields,
      default: z.boolean().meta({ description: DEFAULT_DESCRIPTION }),
    }),
    z.strictObject({
      type: z.literal('string').meta({ description: 'A question answered with text.' }),
      ...questionFields,
      default: z.string().meta({ description: DEFAULT_DESCRIPTION }),
    }),
    z.strictObject({
      type: z.literal('number').meta({ description: 'A question answered with a number.' }),
      ...questionFields,
      default: z.number().meta({ description: DEFAULT_DESCRIPTION }),
    }),
    z
      .strictObject({
        type: z.literal('select').meta({
          description: 'A question answered with one of the choices.',
        }),
        ...questionFields,
        choices: choicesSchema,
        default: kebabCaseId.meta({
          description: 'The value of the choice `--yes` takes.',
        }),
      })
      .refine((option) => hasChoice(option.choices, option.default), {
        message: 'The default is not one of the choices',
        path: ['default'],
      }),
    z
      .strictObject({
        type: z.literal('multiselect').meta({
          description: 'A question answered with any number of the choices.',
        }),
        ...questionFields,
        choices: choicesSchema,
        default: z
          .array(kebabCaseId)
          .meta({ description: 'The values of the choices `--yes` takes.' }),
      })
      .refine((option) => option.default.every((value) => hasChoice(option.choices, value)), {
        message: 'A default is not one of the choices',
        path: ['default'],
      }),
  ])
  .meta({
    id: 'PluginOption',
    description:
      'A further question a plugin asks, with a flag `--<plugin>-<option>`. Every option has a default, so `--yes` can answer it.',
  })
