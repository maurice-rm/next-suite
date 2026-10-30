import * as z from 'zod'

const NAME = '[a-z0-9][a-z0-9-]*'
const SCOPE = `@${NAME}`

/** A plugin a registry lists, addressed as `<registry>/<plugin>`, such as `@acme/mail`. */
export const REGISTRY_PLUGIN_ADDRESS = new RegExp(`^(${SCOPE})/(${NAME})$`)

/** The name of a plugin within its registry, without the registry's scope, such as `mail`. */
export const registryPluginName = z
  .string()
  .regex(new RegExp(`^${NAME}$`), 'Use a lowercase name without a scope, such as `mail`')

/** The short name of a plugin registry, such as `@acme`. */
export const registryName = z
  .string()
  .regex(new RegExp(`^${SCOPE}$`), 'Use a scoped name such as `@acme`')
