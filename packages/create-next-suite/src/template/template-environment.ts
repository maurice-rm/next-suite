import Handlebars from 'handlebars'

const KEPT_HELPERS: ReadonlySet<string> = new Set(['if', 'unless', 'each'])

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
 * An isolated Handlebars environment without the built-in helpers except `if`, `unless` and
 * `each`; the rule check rejects the others first, this is the second guard.
 */
export const templateEnvironment: typeof Handlebars = createTemplateEnvironment()
