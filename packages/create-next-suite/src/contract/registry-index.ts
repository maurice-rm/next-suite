import * as z from 'zod'

import { registryName, registryPluginName } from './identifiers.ts'

/** The index of a registry, read from its `registry.json`: its short name and the plugins it lists. */
export const registryIndexSchema = z
  .strictObject({
    // biome-ignore lint/style/useNamingConvention: JSON Schema fixes the name of this key
    $schema: z.string().optional(),
    name: registryName,
    plugins: z.array(
      z.strictObject({
        name: registryPluginName,
        path: z.string().min(1),
        description: z.string().min(1),
      }),
    ),
  })
  .meta({ title: 'next-suite plugin registry' })

/** The index of a registry, as listed in its `registry.json`. */
export type RegistryIndex = z.output<typeof registryIndexSchema>
