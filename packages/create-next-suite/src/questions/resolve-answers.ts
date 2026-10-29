import type { Answers, AnswerValue } from '../answers/answers.ts'
import { evaluateCondition } from '../answers/evaluate-condition.ts'
import type { PluginOption } from '../contract/plugin-option.ts'
import { InputError } from './input-error.ts'
import type { CategoryQuestion, Question } from './questions.ts'

/** Answers as answer files, flags and next-suite.json write them, keyed by question key. */
export type AnswerInput = Readonly<Record<string, unknown>>

type ResolveInput = {
  questions: readonly Question[]
  input: AnswerInput
  useDefaults: boolean
}

/** The answers that could be resolved, the questions still open, and input no question used. */
export type Resolution = {
  answers: Answers
  missing: Question[]
  unused: string[]
}

type WorkingAnswers = {
  plugins: { name: string; category: string | undefined }[]
  settings: Record<string, AnswerValue>
  options: Record<string, AnswerValue>
}
type QuestionValue = AnswerValue | null

const describe = (value: unknown): string => JSON.stringify(value) ?? String(value)

const invalid = (question: Question, value: unknown, expected: string): InputError =>
  new InputError(`the answer "${question.key}" is ${describe(value)}; expected ${expected}`)

const isStringList = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string')

const listOf = (values: readonly string[]): string => values.join(', ')

const validateCategory = (question: CategoryQuestion, value: unknown): QuestionValue => {
  const names = question.choices.map((plugin) => plugin.name)
  const { cardinality } = question.category
  if (cardinality === 'many') {
    if (
      !isStringList(value) ||
      value.some((name) => !names.includes(name)) ||
      new Set(value).size !== value.length
    ) {
      throw invalid(question, value, `a list of distinct plugins from: ${listOf(names)}`)
    }
    return value
  }
  if (value === null && cardinality === 'at-most-one') {
    return null
  }
  if (typeof value !== 'string' || !names.includes(value)) {
    throw invalid(question, value, `one of: ${listOf(names)}`)
  }
  return value
}

const validateOption = (question: Question, option: PluginOption, value: unknown): AnswerValue => {
  switch (option.type) {
    case 'boolean':
      if (typeof value !== 'boolean') {
        throw invalid(question, value, 'true or false')
      }
      return value
    case 'string':
      if (typeof value !== 'string') {
        throw invalid(question, value, 'a string')
      }
      return value
    case 'number':
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw invalid(question, value, 'a number')
      }
      return value
    case 'select': {
      const values = option.choices.map((choice) => choice.value)
      if (typeof value !== 'string' || !values.includes(value)) {
        throw invalid(question, value, `one of: ${listOf(values)}`)
      }
      return value
    }
    case 'multiselect': {
      const values = option.choices.map((choice) => choice.value)
      if (!isStringList(value) || value.some((item) => !values.includes(item))) {
        throw invalid(question, value, `a list from: ${listOf(values)}`)
      }
      return value
    }
  }
}

const validate = (question: Question, value: unknown): QuestionValue => {
  switch (question.kind) {
    case 'category':
      return validateCategory(question, value)
    case 'addon':
      if (typeof value !== 'boolean') {
        throw invalid(question, value, 'true or false')
      }
      return value
    case 'option':
    case 'setting':
      return validateOption(question, question.option, value)
  }
}

/** The answer `--yes` gives to a question. */
export const defaultAnswer = (question: Question): QuestionValue => {
  switch (question.kind) {
    case 'category':
      return question.category.default
    case 'addon':
      return question.plugin.selectedByDefault ?? false
    case 'option':
    case 'setting':
      return question.option.default
  }
}

const apply = (question: Question, value: QuestionValue, answers: WorkingAnswers): void => {
  switch (question.kind) {
    case 'category': {
      const names = value === null ? [] : [value].flat().map(String)
      answers.plugins.push(...names.map((name) => ({ name, category: question.key })))
      return
    }
    case 'addon':
      if (value === true) {
        answers.plugins.push({ name: question.key, category: undefined })
      }
      return
    case 'option':
    case 'setting':
      if (value === null) {
        return
      }
      if (question.kind === 'option') {
        answers.options[question.key] = value
      } else {
        answers.settings[question.key] = value
      }
  }
}

const isAsked = (question: Question, answers: WorkingAnswers): boolean => {
  if (question.kind !== 'option') {
    return true
  }
  const isSelected = answers.plugins.some((plugin) => plugin.name === question.plugin.name)
  return (
    isSelected &&
    (question.option.when === undefined || evaluateCondition(question.option.when, answers))
  )
}

/** Whether a plugin cannot join the answers so far: one of its conflicts holds or a requirement does not. */
const doesNotFit = (question: CategoryQuestion, name: string, answers: WorkingAnswers): boolean => {
  const plugin = question.choices.find((choice) => choice.name === name)
  const withPlugin = {
    ...answers,
    plugins: [...answers.plugins, { name, category: question.category.id }],
  }
  return (
    (plugin?.conflicts ?? []).some((rule) => evaluateCondition(rule.when, withPlugin)) ||
    (plugin?.requires ?? []).some((rule) => !evaluateCondition(rule.when, withPlugin))
  )
}

/**
 * The default of a question for the answers so far. A default plugin that does not fit, because
 * one of its conflicts holds or a requirement does not, is left out where the category allows
 * none: Prettier once Biome is the linter, lint-staged without linter and formatter.
 */
const defaultFor = (question: Question, answers: WorkingAnswers): QuestionValue => {
  const fallback = defaultAnswer(question)
  if (question.kind !== 'category' || question.category.cardinality === 'one') {
    return fallback
  }
  if (Array.isArray(fallback)) {
    return fallback.filter((name) => !doesNotFit(question, name, answers))
  }
  return typeof fallback === 'string' && doesNotFit(question, fallback, answers) ? null : fallback
}

/**
 * Resolves answers question by question: input wins, then the default when `useDefaults` is set;
 * otherwise the question stays open. Options of plugins that are not selected, or whose condition
 * does not hold, are not asked. Invalid values fail with the expected values.
 */
export const resolveAnswers = ({ questions, input, useDefaults }: ResolveInput): Resolution => {
  const answers: WorkingAnswers = { plugins: [], settings: {}, options: {} }
  const missing: Question[] = []
  const used = new Set<string>()
  for (const question of questions) {
    if (!isAsked(question, answers)) {
      continue
    }
    const given = input[question.key]
    if (given === undefined && !useDefaults) {
      missing.push(question)
      continue
    }
    if (given !== undefined) {
      used.add(question.key)
    }
    apply(
      question,
      given === undefined ? defaultFor(question, answers) : validate(question, given),
      answers,
    )
  }
  return { answers, missing, unused: Object.keys(input).filter((key) => !used.has(key)) }
}
