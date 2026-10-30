import { InvalidArgumentError, Option } from 'commander'

import type { AnswerInput } from '../answers/answers.ts'
import type { PluginOption } from '../contract/plugin-option.ts'
import { InputError } from '../input-error.ts'
import type { CategoryQuestion, Question } from './build-questions.ts'
import { isNumberText } from './value-guards.ts'

const NOT_A_NUMBER = 'not a number'

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

const flagDescriptionOf = (question: Question): string => {
  switch (question.kind) {
    case 'category':
      return question.category.question
    case 'extra':
      return question.plugin.description
    case 'option':
    case 'setting':
      return question.option.question
  }
}

const valueOptions = (name: string, description: string, option: PluginOption): Option[] => {
  switch (option.type) {
    case 'boolean':
      return [new Option(`--${name}`, description), new Option(`--no-${name}`)]
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
        new Option(`--${name} <values>`, `${description} (comma-separated)`).argParser(splitList),
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
      return [
        new Option(`--${name} <plugin>`, description).choices(names),
        new Option(`--no-${name}`, `no ${name}`),
      ]
    case 'many':
      return [
        new Option(
          `--${name} <plugins>`,
          `${description} (comma-separated: ${names.join(', ')})`,
        ).argParser(splitList),
        new Option(`--no-${name}`, `no ${name}`),
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
      return [
        new Option(`--${name}`, description),
        new Option(`--no-${name}`, `skip ${question.plugin.title}`),
      ]
    case 'option':
    case 'setting':
      return valueOptions(name, description, question.option)
  }
}

const flagFor = (question: Question): QuestionFlag => {
  const name = flagNameOf(question)
  const options = commanderOptionsOf(question, name, flagDescriptionOf(question))
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
 * base settings. Two questions with the same flag, or a flag the core reserves, fail.
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
