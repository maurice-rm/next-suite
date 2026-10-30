import {
  type AnswerInput,
  type Answers,
  type AnswerValue,
  isSelected,
  type WorkingAnswers,
} from '../answers/answers.ts'
import { InputError } from '../input-error.ts'
import type { Plugin } from '../plugin-definition/plugin-definition.ts'
import { findUnmetPrecondition } from '../plugin-definition/precondition.ts'
import type { CategoryQuestion, Question } from './build-questions.ts'
import { findConflictReasons } from './find-incompatibilities.ts'
import type { QuestionOption } from './question-option.ts'
import { isStringList } from './value-guards.ts'

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

type QuestionValue = AnswerValue | null

/** A resolution and the plugins only a default selected, where the category allows none. */
type ResolutionPass = { resolution: Resolution; defaulted: Plugin[] }

const formatValue = (value: unknown): string => JSON.stringify(value) ?? String(value)

const invalidAnswerError = (question: Question, value: unknown, expected: string): InputError =>
  new InputError(`the answer "${question.key}" is ${formatValue(value)}; expected ${expected}`)

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
      throw invalidAnswerError(question, value, `a list of distinct plugins from: ${listOf(names)}`)
    }
    return value
  }
  if (value === null && cardinality === 'at-most-one') {
    return null
  }
  if (typeof value !== 'string' || !names.includes(value)) {
    throw invalidAnswerError(question, value, `one of: ${listOf(names)}`)
  }
  return value
}

const validateOption = (
  question: Question,
  option: QuestionOption,
  value: unknown,
): AnswerValue => {
  switch (option.type) {
    case 'boolean':
      if (typeof value !== 'boolean') {
        throw invalidAnswerError(question, value, 'true or false')
      }
      return value
    case 'string':
      if (typeof value !== 'string') {
        throw invalidAnswerError(question, value, 'a string')
      }
      return value
    case 'select': {
      const values = option.choices.map((choice) => choice.value)
      if (typeof value !== 'string' || !values.includes(value)) {
        throw invalidAnswerError(question, value, `one of: ${listOf(values)}`)
      }
      return value
    }
    case 'multiselect': {
      const values = option.choices.map((choice) => choice.value)
      if (!isStringList(value) || value.some((item) => !values.includes(item))) {
        throw invalidAnswerError(question, value, `a list from: ${listOf(values)}`)
      }
      return value
    }
  }
}

const validateAnswer = (question: Question, value: unknown): QuestionValue => {
  switch (question.kind) {
    case 'category':
      return validateCategory(question, value)
    case 'extra':
      if (typeof value !== 'boolean') {
        throw invalidAnswerError(question, value, 'true or false')
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
    case 'extra':
      return false
    case 'option':
    case 'setting':
      return question.option.default
  }
}

const applyAnswer = (question: Question, value: QuestionValue, answers: WorkingAnswers): void => {
  switch (question.kind) {
    case 'category': {
      const names = value === null ? [] : [value].flat().map(String)
      answers.plugins.push(...names.map((name) => ({ name, category: question.key })))
      return
    }
    case 'extra':
      if (value === true) {
        answers.plugins.push({ name: question.key, category: undefined })
      }
      return
    case 'option':
      if (value !== null) {
        answers.options[question.key] = value
      }
      return
    case 'setting':
      if (value !== null) {
        answers.settings[question.key] = value
      }
      return
  }
}

const isAsked = (question: Question, answers: WorkingAnswers): boolean => {
  if (question.kind !== 'option') {
    return true
  }
  return isSelected(answers, question.plugin.name)
}

/**
 * Whether a default plugin cannot join the answers so far: it conflicts with a selected one, or
 * an earlier pass left it out for its precondition.
 */
const doesNotFit = (
  question: CategoryQuestion,
  name: string,
  { answers, excluded }: { answers: WorkingAnswers; excluded: ReadonlySet<string> },
): boolean => {
  const plugin = question.choices.find((choice) => choice.name === name)
  return (
    plugin !== undefined && (excluded.has(name) || findConflictReasons(plugin, answers).length > 0)
  )
}

/**
 * The default of a question for the answers so far. A default plugin that does not fit is left
 * out where the category allows none: Prettier once Biome is the linter.
 */
const defaultFor = (
  question: Question,
  fit: { answers: WorkingAnswers; excluded: ReadonlySet<string> },
): QuestionValue => {
  const fallback = defaultAnswer(question)
  if (question.kind !== 'category' || question.category.cardinality === 'one') {
    return fallback
  }
  if (Array.isArray(fallback)) {
    return fallback.filter((name) => !doesNotFit(question, name, fit))
  }
  return typeof fallback === 'string' && doesNotFit(question, fallback, fit) ? null : fallback
}

/** The plugins a default selected for a category question that allows none. */
const defaultedPlugins = (question: Question, value: QuestionValue): Plugin[] => {
  if (question.kind !== 'category' || question.category.cardinality === 'one' || value === null) {
    return []
  }
  const names = [value].flat()
  return question.choices.filter((plugin) => names.includes(plugin.name))
}

const resolvePass = (
  { questions, input, useDefaults }: ResolveInput,
  excluded: ReadonlySet<string>,
): ResolutionPass => {
  const answers: WorkingAnswers = { plugins: [], settings: {}, options: {} }
  const missing: Question[] = []
  const used = new Set<string>()
  const defaulted: Plugin[] = []
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
      applyAnswer(question, validateAnswer(question, given), answers)
      continue
    }
    const value = defaultFor(question, { answers, excluded })
    defaulted.push(...defaultedPlugins(question, value))
    applyAnswer(question, value, answers)
  }
  return {
    resolution: { answers, missing, unused: Object.keys(input).filter((key) => !used.has(key)) },
    defaulted,
  }
}

/**
 * Resolves answers question by question: input wins, then the default when `useDefaults` is set;
 * otherwise the question stays open. Options of plugins that are not selected are not asked.
 * A plugin only a default selected is left out where the category allows none when its
 * precondition fails on the whole selection; the answers are then resolved again without it.
 * Invalid values fail with the expected values.
 */
export const resolveAnswers = (resolveInput: ResolveInput): Resolution => {
  const excluded = new Set<string>()
  for (;;) {
    const { resolution, defaulted } = resolvePass(resolveInput, excluded)
    const unavailable = defaulted.filter(
      (plugin) =>
        findUnmetPrecondition(plugin.precondition, resolution.answers.plugins) !== undefined,
    )
    if (unavailable.length === 0) {
      return resolution
    }
    for (const plugin of unavailable) {
      excluded.add(plugin.name)
    }
  }
}
