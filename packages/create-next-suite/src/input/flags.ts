import { InvalidArgumentError, Option } from 'commander'

import type { PluginOption } from '../contract/plugin-option.ts'
import { InputError } from './input-error.ts'
import type { Question } from './questions.ts'
import type { AnswerInput } from './resolve-answers.ts'

// Flags the core defines itself; no question flag may take these names.
const RESERVED_FLAGS: ReadonlySet<string> = new Set([
  'yes',
  'answers',
  'dry-run',
  'diff',
  'help',
  'version',
])

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
  const number = Number(value)
  if (value.trim() === '' || !Number.isFinite(number)) {
    throw new InvalidArgumentError('Not a number.')
  }
  return number
}

const flagNameOf = (question: Question): string => {
  if (question.kind !== 'option') {
    return question.key
  }
  const [, option] = question.key.split(/\.(?=[^.]+$)/)
  return `${question.plugin.name.replace(/^@/, '').replace('/', '-')}-${option}`
}

const describeOption = (question: Question): string => {
  switch (question.kind) {
    case 'category':
      return question.category.question
    case 'addon':
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
  question: Extract<Question, { kind: 'category' }>,
  name: string,
  description: string,
) => {
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
  (question: Extract<Question, { kind: 'category' }>) => (value: unknown) => {
    if (value !== false) {
      return value
    }
    return question.category.cardinality === 'many' ? [] : null
  }

const flagFor = (question: Question): QuestionFlag => {
  const name = flagNameOf(question)
  const description = describeOption(question)
  if (question.kind === 'category') {
    const options = categoryOptions(question, name, description)
    return {
      options,
      attribute: options[0]?.attributeName() ?? name,
      question,
      toAnswer: toCategoryAnswer(question),
    }
  }
  const options =
    question.kind === 'addon'
      ? [
          new Option(`--${name}`, description),
          new Option(`--no-${name}`, `skip ${question.plugin.title}`),
        ]
      : valueOptions(name, description, question.option)
  return {
    options,
    attribute: options[0]?.attributeName() ?? name,
    question,
    toAnswer: (value) => value,
  }
}

/**
 * Derives one command-line flag per question: `--<category> <plugin>`, `--<plugin>` and
 * `--no-<plugin>` for plugins without a category, `--<plugin>-<option>` for plugin options and
 * `--<setting>` for base settings. Two questions with the same flag, or a reserved flag name, fail.
 */
export const createFlags = (questions: readonly Question[]): QuestionFlag[] => {
  const seen = new Map<string, string>()
  return questions.map((question) => {
    const name = flagNameOf(question)
    const owner = seen.get(name)
    if (RESERVED_FLAGS.has(name) || owner !== undefined) {
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
