import type { Answers } from '../answers/answers.ts'
import { evaluateCondition } from '../answers/evaluate-condition.ts'
import type { ParsedPluginManifest } from '../contract/plugin-manifest.ts'

const selectedOf = (
  plugins: readonly ParsedPluginManifest[],
  answers: Answers,
): ParsedPluginManifest[] =>
  plugins.filter((plugin) => answers.plugins.some((answer) => answer.name === plugin.name))

/** Lists every conflict of a selected plugin that holds, as "<plugin title>: <reason>". */
export const findConflicts = (
  plugins: readonly ParsedPluginManifest[],
  answers: Answers,
): string[] =>
  selectedOf(plugins, answers).flatMap((plugin) =>
    (plugin.conflicts ?? [])
      .filter((rule) => evaluateCondition(rule.when, answers))
      .map((rule) => `${plugin.title}: ${rule.reason}`),
  )

/**
 * Lists every requirement of a selected plugin that does not hold and every conflict that does,
 * each as "<plugin title>: <reason>" from the plugin's own manifest.
 */
export const findIncompatibilities = (
  plugins: readonly ParsedPluginManifest[],
  answers: Answers,
): string[] => [
  ...selectedOf(plugins, answers).flatMap((plugin) =>
    (plugin.requires ?? [])
      .filter((rule) => !evaluateCondition(rule.when, answers))
      .map((rule) => `${plugin.title}: ${rule.reason}`),
  ),
  ...findConflicts(plugins, answers),
]
