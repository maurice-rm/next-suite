import * as z from 'zod'

const KEBAB_CASE = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/
const PLUGIN_NAME = /^(?:@[a-z0-9][a-z0-9-]*\/)?[a-z0-9][a-z0-9-]*$/
const OPTION_REFERENCE =
  /^(?:@[a-z0-9][a-z0-9-]*\/)?[a-z0-9][a-z0-9-]*\.[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/

export const kebabCaseId = z.string().regex(KEBAB_CASE, 'Use kebab-case, such as `package-manager`')

export const pluginName = z
  .string()
  .regex(PLUGIN_NAME, 'Use a lowercase name, optionally scoped, such as `drizzle` or `@acme/auth`')

export const optionReference = z
  .string()
  .regex(OPTION_REFERENCE, 'Name a plugin option as `<plugin>.<option>`, such as `seo.og-image`')
