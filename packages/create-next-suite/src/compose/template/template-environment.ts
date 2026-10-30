import Handlebars from 'handlebars'

import { BLOCK_HELPERS } from './block-helpers.ts'

const KEPT_HELPERS: ReadonlySet<string> = new Set(BLOCK_HELPERS)

const createTemplateEnvironment = (): typeof Handlebars => {
  const environment = Handlebars.create()
  for (const name of Object.keys(environment.helpers)) {
    if (!KEPT_HELPERS.has(name)) {
      environment.unregisterHelper(name)
    }
  }
  return environment
}

/**
 * An isolated Handlebars environment without the built-in helpers except the block helpers
 * templates may use; the rule check rejects the others first, this is the second guard.
 */
export const templateEnvironment: typeof Handlebars = createTemplateEnvironment()
