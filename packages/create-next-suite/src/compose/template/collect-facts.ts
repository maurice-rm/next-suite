import type { Answers } from '../../answers/answers.ts'
import { evaluateCondition } from '../../answers/evaluate-condition.ts'
import type { LoadedPlugin } from '../../loader/load-plugin.ts'
import type { Facts } from './render-template.ts'
import { TemplateError } from './template-error.ts'

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
  for (const { manifest } of plugins) {
    for (const [name, condition] of Object.entries(manifest.facts ?? {})) {
      const key = `fact:${name}`
      if (facts.has(key)) {
        throw new TemplateError(
          `two plugins define the fact "${name}"; ${manifest.name} is one of them`,
        )
      }
      facts.set(key, evaluateCondition(condition, answers))
    }
  }
  return facts
}
