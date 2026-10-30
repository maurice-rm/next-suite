import * as z from 'zod'

import { registryName, registryPluginName } from './identifiers.ts'

const registryPluginSchema = z
  .strictObject({
    name: registryPluginName.meta({
      description:
        'The name of the plugin within the registry, without its scope, such as `mail`; loaded as `<registry>/<name>`.',
    }),
    path: z.string().min(1).meta({
      description:
        'The directory of the plugin, relative to registry.json and inside the registry.',
    }),
    description: z.string().min(1).meta({
      description:
        'What the plugin does, in one sentence; listed by `next-suite registry list <registry>`.',
    }),
  })
  .meta({ id: 'RegistryPlugin', description: 'A plugin the registry lists.' })

export const registryIndexSchema = z
  .strictObject({
    // biome-ignore lint/style/useNamingConvention: JSON Schema fixes the name of this key
    $schema: z
      .string()
      .optional()
      .meta({ description: 'The JSON schema of registry.json, for completion in an editor.' }),
    name: registryName.meta({
      description: 'The short name of the registry, a scope such as `@acme`.',
    }),
    plugins: z.array(registryPluginSchema).meta({ description: 'The plugins the registry lists.' }),
  })
  .meta({
    title: 'next-suite plugin registry',
    description:
      'The index of a registry, its registry.json: its short name and the plugins it lists.',
  })

/** The index of a registry, its registry.json: its short name and the plugins it lists. */
export type RegistryIndex = z.output<typeof registryIndexSchema>
