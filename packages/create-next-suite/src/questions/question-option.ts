import type { OptionChoice, PluginOption } from '../plugin-definition/plugin-option.ts'

/** A choice as a question offers it: its value, the label the wizard shows and the hint beside it. */
export type QuestionChoice = {
  value: string
  label: string
  description?: string
}

/**
 * How a question of a plugin option or a setting is answered: yes or no, free text, one of the
 * choices or any number of them.
 */
export type QuestionOption = {
  /** The question the wizard asks. */
  question: string
  /** What the answer sets, as a short statement; the help of its flag shows it. */
  description?: string
} & (
  | { type: 'boolean'; default: boolean }
  | { type: 'string'; default: string }
  | { type: 'select'; choices: QuestionChoice[]; default: string }
  | { type: 'multiselect'; choices: QuestionChoice[]; default: string[] }
)

const questionChoiceOf = (choice: OptionChoice): QuestionChoice =>
  typeof choice === 'string'
    ? { value: choice, label: choice }
    : {
        value: choice.value,
        label: choice.label ?? choice.value,
        ...(choice.description === undefined ? {} : { description: choice.description }),
      }

/** A plugin's option as its question asks it, every choice with its label. */
export const questionOptionOf = (option: PluginOption): QuestionOption => {
  const fields = {
    question: option.question,
    ...(option.description === undefined ? {} : { description: option.description }),
  }
  if (option.type === 'boolean') {
    return { ...fields, type: 'boolean', default: option.default }
  }
  const choices = option.choices.map(questionChoiceOf)
  return option.type === 'multiselect'
    ? { ...fields, type: 'multiselect', choices, default: [...option.default] }
    : { ...fields, type: 'select', choices, default: option.default }
}
