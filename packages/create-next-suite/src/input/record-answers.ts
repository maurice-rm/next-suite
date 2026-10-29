import type { Answers } from '../answers/answers.ts'
import type { Question } from './questions.ts'

const selectedIn = (answers: Answers, category: string): string[] =>
  answers.plugins.filter((plugin) => plugin.category === category).map((plugin) => plugin.name)

const recordOne = (question: Question, answers: Answers): unknown => {
  switch (question.kind) {
    case 'category': {
      const names = selectedIn(answers, question.key)
      if (question.category.cardinality === 'many') {
        return names
      }
      return names[0] ?? null
    }
    case 'addon':
      return answers.plugins.some((plugin) => plugin.name === question.key)
    case 'option':
      return answers.options[question.key]
    case 'setting':
      return answers.settings[question.key]
  }
}

/**
 * Writes answers in the format answer files take: every category with its plugin, a list for
 * categories of many plugins and null for none; every plugin without a category as true or
 * false; every setting and every option that was asked. Reading the result back gives the same
 * answers.
 */
export const recordAnswers = (
  questions: readonly Question[],
  answers: Answers,
): Record<string, unknown> =>
  Object.fromEntries(
    questions
      .map((question) => [question.key, recordOne(question, answers)] as const)
      .filter(([, value]) => value !== undefined),
  )
