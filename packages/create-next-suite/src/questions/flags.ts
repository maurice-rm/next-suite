import { InvalidArgumentError, Option } from 'commander'

import type { AnswerInput } from '../answers/answers.ts'
import type { PluginOption } from '../contract/plugin-option.ts'
import { InputError } from '../input-error.ts'
import type { CategoryQuestion, Question } from './build-questions.ts'
import { isNumberText } from './value-guards.ts'

const NOT_A_NUMBER = 'not a number'
/** The help group of extras that name no section. */
const EXTRAS_SECTION = 'Extras'

/** A command-line option derived from a question, with how its value becomes an answer. */
export type QuestionFlag = {
  options: Option[]
  attribute: string
  question: Question
  toAnswer: (value: unknown) => unknown
}

const splitList = (value: string): string[] =>
  value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item !== '')

const parseNumber = (value: string): number => {
  if (!isNumberText(value)) {
    throw new InvalidArgumentError(NOT_A_NUMBER)
  }
  return Number(value)
}

const flagNameOf = (question: Question): string => {
  if (question.kind !== 'option') {
    return question.key
  }
  return `${question.plugin.name.replace(/^@/, '').replace('/', '-')}-${question.optionKey}`
}

/** The description of an option, or a statement naming it: "turn on" it for a boolean. */
const optionDescriptionOf = (option: PluginOption, name: string): string => {
  if (option.description !== undefined) {
    return option.description
  }
  return option.type === 'boolean' ? `turn on ${name}` : name
}

/** A short statement of what a flag sets, derived from its category or option. */
const flagDescriptionOf = (question: Question): string => {
  switch (question.kind) {
    case 'category':
      return question.category.cardinality === 'many'
        ? `plugins of the category ${question.category.id}, comma-separated`
        : `plugin of the category ${question.category.id}`
    case 'extra':
      return `add ${question.plugin.title}`
    case 'option':
      return optionDescriptionOf(
        question.option,
        `the ${question.optionKey} option of ${question.plugin.title}`,
      )
    case 'setting':
      return optionDescriptionOf(question.option, `the ${question.key} setting`)
  }
}

const negatedOption = (name: string): Option => new Option(`--no-${name}`, `turn off --${name}`)

const quotedChoices = (choices: readonly string[]): string =>
  choices.map((choice) => `"${choice}"`).join(', ')

const valueOptions = (name: string, description: string, option: PluginOption): Option[] => {
  switch (option.type) {
    case 'boolean':
      return [new Option(`--${name}`, description), negatedOption(name)]
    case 'string':
      return [new Option(`--${name} <value>`, description)]
    case 'number':
      return [new Option(`--${name} <number>`, description).argParser(parseNumber)]
    case 'select':
      return [
        new Option(`--${name} <value>`, description).choices(
          option.choices.map((choice) => choice.value),
        ),
      ]
    case 'multiselect':
      return [
        new Option(
          `--${name} <values>`,
          `${description}, comma-separated (choices: ${quotedChoices(option.choices.map((choice) => choice.value))})`,
        ).argParser(splitList),
      ]
  }
}

const categoryOptions = (
  question: CategoryQuestion,
  name: string,
  description: string,
): Option[] => {
  const names = question.choices.map((plugin) => plugin.name)
  switch (question.category.cardinality) {
    case 'one':
      return [new Option(`--${name} <plugin>`, description).choices(names)]
    case 'at-most-one':
      return [new Option(`--${name} <plugin>`, description).choices(names), negatedOption(name)]
    case 'many':
      return [
        new Option(
          `--${name} <plugins>`,
          `${description} (choices: ${quotedChoices(names)})`,
        ).argParser(splitList),
        negatedOption(name),
      ]
  }
}

const toCategoryAnswer =
  (question: CategoryQuestion) =>
  (value: unknown): unknown => {
    if (value !== false) {
      return value
    }
    return question.category.cardinality === 'many' ? [] : null
  }

const keepValue = (value: unknown): unknown => value

const commanderOptionsOf = (question: Question, name: string, description: string): Option[] => {
  switch (question.kind) {
    case 'category':
      return categoryOptions(question, name, description)
    case 'extra':
      return [new Option(`--${name}`, description), negatedOption(name)]
    case 'option':
    case 'setting':
      return valueOptions(name, description, question.option)
  }
}

const flagFor = (question: Question): QuestionFlag => {
  const name = flagNameOf(question)
  const helpGroup = `${question.section ?? EXTRAS_SECTION}:`
  const options = commanderOptionsOf(question, name, flagDescriptionOf(question)).map((option) =>
    option.helpGroup(helpGroup),
  )
  return {
    options,
    attribute: options[0]?.attributeName() ?? name,
    question,
    toAnswer: question.kind === 'category' ? toCategoryAnswer(question) : keepValue,
  }
}

/**
 * Derives one command-line flag per question: `--<category> <plugin>`, `--<plugin>` and
 * `--no-<plugin>` for extras, `--<plugin>-<option>` for plugin options and `--<setting>` for
 * settings, grouped in the help by the section of the wizard that asks them. Two questions with
 * the same flag, or a flag the core reserves, fail.
 */
export const createFlags = (
  questions: readonly Question[],
  reservedNames: ReadonlySet<string>,
): QuestionFlag[] => {
  const seen = new Map<string, string>()
  return questions.map((question) => {
    const name = flagNameOf(question)
    const owner = seen.get(name)
    if (reservedNames.has(name) || owner !== undefined) {
      throw new InputError(
        `the flag --${name} of "${question.key}" is already taken${owner ? ` by "${owner}"` : ''}`,
      )
    }
    seen.set(name, question.key)
    return flagFor(question)
  })
}

/** Turns parsed flag values into answers, keyed like answer files. */
export const answersFromFlags = (
  flags: readonly QuestionFlag[],
  values: Record<string, unknown>,
): AnswerInput =>
  Object.fromEntries(
    flags
      .filter((flag) => values[flag.attribute] !== undefined)
      .map((flag) => [flag.question.key, flag.toAnswer(values[flag.attribute])]),
  )
