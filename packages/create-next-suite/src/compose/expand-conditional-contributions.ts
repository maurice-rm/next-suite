import type { Answers } from '../answers/answers.ts'
import { evaluateCondition } from '../answers/evaluate-condition.ts'
import type { ParsedPluginManifest } from '../contract/plugin-manifest.ts'
import { derivedManifest } from './derived-manifest.ts'

/**
 * The manifest and, for each conditional contribution whose condition holds, a manifest of the
 * same plugin with just that contribution.
 */
export const expandConditionalContributions = (
  manifest: ParsedPluginManifest,
  answers: Answers,
): ParsedPluginManifest[] => [
  manifest,
  ...(manifest.conditionalContributions ?? [])
    .filter((group) => evaluateCondition(group.when, answers))
    .map((group) => derivedManifest(manifest, { contributes: group.contributes })),
]
