import type { Condition } from '../contract/condition.ts'
import type { Answers, AnswerValue } from './answers.ts'

type ComparableValue = string | number | boolean

const matchesValue = (answer: AnswerValue | undefined, expected: ComparableValue): boolean =>
  Array.isArray(answer) ? answer.some((item) => item === expected) : answer === expected

/**
 * Answers whether a condition holds. A setting or option that has no answer, such as an option of a
 * plugin that is not selected, matches no value. A multiselect answer matches every value it
 * contains.
 */
export const evaluateCondition = (condition: Condition, answers: Answers): boolean => {
  if ('plugin' in condition) {
    return answers.plugins.some((plugin) => plugin.name === condition.plugin)
  }
  if ('category' in condition) {
    return answers.plugins.some((plugin) => plugin.category === condition.category)
  }
  if ('setting' in condition) {
    return matchesValue(answers.settings[condition.setting], condition.equals)
  }
  if ('option' in condition) {
    const answer = answers.options[condition.option]
    const expected = 'equals' in condition ? [condition.equals] : condition.in
    return expected.some((value) => matchesValue(answer, value))
  }
  if ('all' in condition) {
    return condition.all.every((part) => evaluateCondition(part, answers))
  }
  if ('any' in condition) {
    return condition.any.some((part) => evaluateCondition(part, answers))
  }
  return !evaluateCondition(condition.not, answers)
}
