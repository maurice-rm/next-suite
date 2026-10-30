import { type Answers, isSelected } from '../answers/answers.ts'
import type { Question } from './build-questions.ts'

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
    case 'extra':
      return isSelected(answers, question.key)
    case 'option':
      return answers.options[question.key]
    case 'setting':
      return question.scope === 'project' ? answers.settings[question.key] : undefined
  }
}

/**
 * Writes answers in the format answer files take: every category with its plugin, a list for
 * categories of many plugins and null for none; every extra as true or false; every project
 * setting and every option that was asked. Settings of the run, such as whether to install, stay
 * out. Reading the result back gives the same answers.
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
