import { ExpectedError } from '../../expected-error.ts'
import { BLOCK_HELPERS, type BlockHelper, FACT_HELPER } from './block-helpers.ts'
import { checkTemplate } from './check-template.ts'
import { templateEnvironment } from './template-environment.ts'
import { TemplateError } from './template-error.ts'

type TemplateInput = {
  source: string
  values: object
  /** Answers whether a named fact holds; fails for an unknown fact. */
  has: (fact: string) => boolean
  allowedBlocks: readonly BlockHelper[]
}

const COMPILE_OPTIONS: CompileOptions = {
  strict: true,
  noEscape: true,
  knownHelpers: Object.fromEntries([...BLOCK_HELPERS, FACT_HELPER].map((name) => [name, true])),
  knownHelpersOnly: true,
}

/**
 * Renders a template in an isolated Handlebars environment that keeps only the block helpers and
 * `has`, after checking it against the template rules. A missing value or an unknown fact fails
 * the render.
 */
export const renderTemplate = ({ source, values, has, allowedBlocks }: TemplateInput): string => {
  checkTemplate(source, allowedBlocks)
  try {
    return templateEnvironment.compile(source, COMPILE_OPTIONS)(values, {
      helpers: { [FACT_HELPER]: (fact: string) => has(fact) },
    })
  } catch (error) {
    if (error instanceof ExpectedError) {
      throw error
    }
    throw new TemplateError(`the template failed to render: ${String(error)}`, { cause: error })
  }
}
