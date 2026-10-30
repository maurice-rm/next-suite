import type { Answers } from '../answers/answers.ts'
import { evaluateCondition } from '../answers/evaluate-condition.ts'
import type { LoadedPlugin } from '../loader/load-plugin.ts'
import { ComposeError } from './compose-error.ts'

/** Every named fact templates and logic modules may ask through `has`, with whether it holds. */
export type Facts = ReadonlyMap<string, boolean>

/**
 * Collects every fact templates may ask: `plugin:<name>` for each available plugin,
 * `category:<id>` for each of their categories, and `fact:<name>` for each fact a plugin defines.
 */
export const collectFacts = (plugins: readonly LoadedPlugin[], answers: Answers): Facts => {
  const facts = new Map<string, boolean>()
  for (const { manifest } of plugins) {
    facts.set(`plugin:${manifest.name}`, evaluateCondition({ plugin: manifest.name }, answers))
    if (manifest.category !== undefined) {
      facts.set(
        `category:${manifest.category}`,
        evaluateCondition({ category: manifest.category }, answers),
      )
    }
  }
  const definers = new Map<string, string>()
  const definitions = plugins.flatMap(({ manifest }) =>
    Object.entries(manifest.facts ?? {}).map(([name, condition]) => ({
      name,
      condition,
      origin: manifest.name,
    })),
  )
  for (const { name, condition, origin } of definitions) {
    const definer = definers.get(name)
    if (definer !== undefined) {
      throw new ComposeError(`${definer} and ${origin} both define the fact "${name}"`)
    }
    definers.set(name, origin)
    facts.set(`fact:${name}`, evaluateCondition(condition, answers))
  }
  return facts
}

/** Answers whether a fact holds; `asker`, such as `the template`, asking an unknown fact fails. */
export const askFact = (facts: Facts, name: string, asker: string): boolean => {
  const holds = facts.get(name)
  if (holds === undefined) {
    throw new ComposeError(`${asker} asks the unknown fact "${name}"`)
  }
  return holds
}
