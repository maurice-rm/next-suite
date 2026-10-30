import * as z from 'zod'

const KEBAB_CASE = '[a-z][a-z0-9]*(?:-[a-z0-9]+)*'
const NAME = '[a-z0-9][a-z0-9-]*'
const SCOPE = `@${NAME}`
const SCRIPT_NAME = /^[a-z][a-z0-9:-]*$/

/** A plugin a registry lists, addressed as `<registry>/<plugin>`, such as `@acme/mail`. */
export const REGISTRY_PLUGIN_ADDRESS = new RegExp(`^(${SCOPE})/(${NAME})$`)

export const kebabCaseId = z
  .string()
  .regex(new RegExp(`^${KEBAB_CASE}$`), 'Use kebab-case, such as `package-manager`')

export const pluginName = z
  .string()
  .regex(
    new RegExp(`^(?:${SCOPE}/)?${NAME}$`),
    'Use a lowercase name, optionally scoped, such as `drizzle` or `@acme/auth`',
  )

/** The name of a plugin within its registry, without the registry's scope, such as `mail`. */
export const registryPluginName = z
  .string()
  .regex(new RegExp(`^${NAME}$`), 'Use a lowercase name without a scope, such as `mail`')

export const optionReference = z
  .string()
  .regex(
    new RegExp(`^(?:${SCOPE}/)?${NAME}\\.${KEBAB_CASE}$`),
    'Name a plugin option as `<plugin>.<option>`, such as `seo.og-image`',
  )

export const scriptName = z.string().regex(SCRIPT_NAME, 'Use a script name such as `db:migrate`')

/** The short name of a plugin registry, such as `@acme`. */
export const registryName = z
  .string()
  .regex(new RegExp(`^${SCOPE}$`), 'Use a scoped name such as `@acme`')
