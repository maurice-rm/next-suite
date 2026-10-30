import * as z from 'zod'

import { conditionSchema } from './condition.ts'
import { kebabCaseId } from './identifiers.ts'

const choiceSchema = z.strictObject({
  value: kebabCaseId,
  label: z.string().min(1),
  description: z.string().min(1).optional(),
})

const questionFields = {
  question: z.string().min(1),
  description: z.string().min(1).optional().meta({
    description:
      'What the option sets, as a short statement such as "use the React Compiler"; the help of its flag shows it.',
  }),
  when: conditionSchema.optional(),
}

const hasChoice = (choices: { value: string }[], value: string): boolean =>
  choices.some((choice) => choice.value === value)

/** A question a plugin asks; every option has a default, so `--yes` can answer it. */
export const pluginOptionSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('boolean'), ...questionFields, default: z.boolean() }),
  z.strictObject({ type: z.literal('string'), ...questionFields, default: z.string() }),
  z.strictObject({ type: z.literal('number'), ...questionFields, default: z.number() }),
  z
    .strictObject({
      type: z.literal('select'),
      ...questionFields,
      choices: z.array(choiceSchema).min(1),
      default: kebabCaseId,
    })
    .refine((option) => hasChoice(option.choices, option.default), {
      message: 'The default is not one of the choices',
      path: ['default'],
    }),
  z
    .strictObject({
      type: z.literal('multiselect'),
      ...questionFields,
      choices: z.array(choiceSchema).min(1),
      default: z.array(kebabCaseId),
    })
    .refine((option) => option.default.every((value) => hasChoice(option.choices, value)), {
      message: 'A default is not one of the choices',
      path: ['default'],
    }),
])

/** A question a plugin asks, with the default `--yes` takes. */
export type PluginOption = z.input<typeof pluginOptionSchema>
