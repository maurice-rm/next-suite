import type { Answers } from '../answers/answers.ts'
import { evaluateCondition } from '../answers/evaluate-condition.ts'
import type { ParsedPluginManifest } from '../contract/plugin-manifest.ts'
import { ComposeError } from './compose-error.ts'

type Dependencies = Readonly<Record<string, string>>

/** Adds dependencies; a name listed with another version already is an error. */
const addTo = (name: string, base: Dependencies | undefined, extras: Dependencies[]) => {
  const result: Record<string, string> = { ...base }
  for (const extra of extras) {
    for (const [dependency, version] of Object.entries(extra)) {
      if (result[dependency] !== undefined && result[dependency] !== version) {
        throw new ComposeError(`${name} lists "${dependency}" with two versions`)
      }
      result[dependency] = version
    }
  }
  return result
}

/**
 * The manifest with the conditional dependencies whose condition holds moved into its
 * dependencies, so they merge like any other; the others are dropped.
 */
export const applyConditionalDependencies = (
  manifest: ParsedPluginManifest,
  answers: Answers,
): ParsedPluginManifest => {
  const holding = (manifest.conditionalDependencies ?? []).filter((group) =>
    evaluateCondition(group.when, answers),
  )
  if (holding.length === 0) {
    return manifest
  }
  return {
    ...manifest,
    dependencies: addTo(
      manifest.name,
      manifest.dependencies,
      holding.map((group) => group.dependencies ?? {}),
    ),
    devDependencies: addTo(
      manifest.name,
      manifest.devDependencies,
      holding.map((group) => group.devDependencies ?? {}),
    ),
  }
}
