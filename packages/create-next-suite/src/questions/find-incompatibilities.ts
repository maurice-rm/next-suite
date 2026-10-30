import { type Answers, isSelected } from '../answers/answers.ts'
import { evaluateCondition } from '../answers/evaluate-condition.ts'
import type { ParsedPluginManifest } from '../contract/plugin-manifest.ts'
import { InputError } from '../input-error.ts'

/** A conflict of a plugin that holds, or a requirement that does not, with its manifest reason. */
type PluginProblem = { kind: 'conflict' | 'requirement'; reason: string }

const withPlugin = (answers: Answers, plugin: ParsedPluginManifest): Answers =>
  isSelected(answers, plugin.name)
    ? answers
    : {
        ...answers,
        plugins: [...answers.plugins, { name: plugin.name, category: plugin.category }],
      }

/**
 * Lists the problems a plugin has with the answers once it is selected: every requirement that
 * does not hold, then every conflict that does.
 */
export const findPluginProblems = (
  plugin: ParsedPluginManifest,
  answers: Answers,
): PluginProblem[] => {
  const answersWithPlugin = withPlugin(answers, plugin)
  return [
    ...(plugin.requires ?? [])
      .filter((rule) => !evaluateCondition(rule.when, answersWithPlugin))
      .map((rule): PluginProblem => ({ kind: 'requirement', reason: rule.reason })),
    ...(plugin.conflicts ?? [])
      .filter((rule) => evaluateCondition(rule.when, answersWithPlugin))
      .map((rule): PluginProblem => ({ kind: 'conflict', reason: rule.reason })),
  ]
}

const listProblems = (
  plugins: readonly ParsedPluginManifest[],
  answers: Answers,
  kind: PluginProblem['kind'],
): string[] =>
  plugins
    .filter((plugin) => isSelected(answers, plugin.name))
    .flatMap((plugin) =>
      findPluginProblems(plugin, answers)
        .filter((problem) => problem.kind === kind)
        .map((problem) => `${plugin.title}: ${problem.reason}`),
    )

/** Lists every conflict of a selected plugin that holds, as "<plugin title>: <reason>". */
export const findConflicts = (
  plugins: readonly ParsedPluginManifest[],
  answers: Answers,
): string[] => listProblems(plugins, answers, 'conflict')

/**
 * Lists every requirement of a selected plugin that does not hold and every conflict that does,
 * each as "<plugin title>: <reason>" from the plugin's own manifest.
 */
export const findIncompatibilities = (
  plugins: readonly ParsedPluginManifest[],
  answers: Answers,
): string[] => [
  ...listProblems(plugins, answers, 'requirement'),
  ...listProblems(plugins, answers, 'conflict'),
]

/** Fails with every problem when the answers do not fit together. */
export const assertCompatible = (problems: readonly string[]): void => {
  if (problems.length > 0) {
    throw new InputError(`the answers do not fit together:\n${problems.join('\n')}`)
  }
}
