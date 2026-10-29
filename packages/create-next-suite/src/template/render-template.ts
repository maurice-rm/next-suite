import { type BlockHelper, checkTemplate } from './check-template.ts'
import { templateEnvironment } from './template-environment.ts'
import { TemplateError } from './template-error.ts'

/** Every named fact a template may ask through `has`, with whether it holds. */
export type Facts = ReadonlyMap<string, boolean>

type TemplateInput = {
  source: string
  values: object
  facts: Facts
  allowedBlocks: readonly BlockHelper[]
}

const COMPILE_OPTIONS: CompileOptions = {
  strict: true,
  noEscape: true,
  knownHelpers: { if: true, unless: true, each: true, has: true },
  knownHelpersOnly: true,
}

const askFact = (facts: Facts) => (name: string) => {
  const holds = facts.get(name)
  if (holds === undefined) {
    throw new TemplateError(`the template asks the unknown fact "${name}"`)
  }
  return holds
}

/**
 * Renders a template in an isolated Handlebars environment that keeps only `if`, `unless`, `each`
 * and `has`, after checking it against the template rules. A missing value or an unknown fact
 * fails the render.
 */
export const renderTemplate = ({ source, values, facts, allowedBlocks }: TemplateInput): string => {
  checkTemplate(source, allowedBlocks)
  try {
    return templateEnvironment.compile(source, COMPILE_OPTIONS)(values, {
      helpers: { has: askFact(facts) },
    })
  } catch (error) {
    if (error instanceof TemplateError) {
      throw error
    }
    throw new TemplateError(`the template failed to render: ${String(error)}`, { cause: error })
  }
}
