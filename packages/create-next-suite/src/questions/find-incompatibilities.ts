import { type Answers, isSelected } from '../answers/answers.ts'
import { InputError } from '../input-error.ts'
import type { Plugin } from '../plugin-definition/plugin-definition.ts'

/** The reason of each conflict a plugin has with a selected plugin. */
export const findConflictReasons = (plugin: Plugin, answers: Answers): string[] =>
  Object.entries(plugin.conflicts ?? {})
    .filter(([other]) => isSelected(answers, other))
    .map(([, reason]) => reason)

/** Lists every conflict of a selected plugin, as "<plugin title>: <reason>". */
export const findConflicts = (plugins: readonly Plugin[], answers: Answers): string[] =>
  plugins
    .filter((plugin) => isSelected(answers, plugin.name))
    .flatMap((plugin) =>
      findConflictReasons(plugin, answers).map((reason) => `${plugin.title}: ${reason}`),
    )

/** Fails with every problem when the answers do not fit together. */
export const assertCompatible = (problems: readonly string[]): void => {
  if (problems.length > 0) {
    throw new InputError(`the answers do not fit together:\n${problems.join('\n')}`)
  }
}
