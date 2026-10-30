import { type Answers, isSelected } from '../answers/answers.ts'
import { InputError } from '../input-error.ts'
import type { Plugin } from '../plugin-definition/plugin-definition.ts'
import { findUnmetPrecondition } from '../plugin-definition/precondition.ts'

/** The reason of each conflict a plugin has with a selected plugin. */
export const findConflictReasons = (plugin: Plugin, answers: Answers): string[] =>
  Object.entries(plugin.conflicts ?? {})
    .filter(([other]) => isSelected(answers, other))
    .map(([, reason]) => reason)

const describeProblems = (
  plugins: readonly Plugin[],
  answers: Answers,
  reasonsOf: (plugin: Plugin) => string[],
): string[] =>
  plugins
    .filter((plugin) => isSelected(answers, plugin.name))
    .flatMap((plugin) => reasonsOf(plugin).map((reason) => `${plugin.title}: ${reason}`))

/** Lists every conflict of a selected plugin, as "<plugin title>: <reason>". */
export const findConflicts = (plugins: readonly Plugin[], answers: Answers): string[] =>
  describeProblems(plugins, answers, (plugin) => findConflictReasons(plugin, answers))

/**
 * Lists every unmet precondition and every conflict of a selected plugin, each as
 * "<plugin title>: <reason>" in the plugin's own words.
 */
export const findIncompatibilities = (plugins: readonly Plugin[], answers: Answers): string[] => [
  ...describeProblems(plugins, answers, (plugin) => {
    const reason = findUnmetPrecondition(plugin.precondition, answers.plugins)
    return reason === undefined ? [] : [reason]
  }),
  ...findConflicts(plugins, answers),
]

/** Fails with every problem when the answers do not fit together. */
export const assertCompatible = (problems: readonly string[]): void => {
  if (problems.length > 0) {
    throw new InputError(`the answers do not fit together:\n${problems.join('\n')}`)
  }
}
