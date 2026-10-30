import * as z from 'zod'

import { categoriesSchema } from './category.ts'
import { pluginManifestSchema } from './plugin-manifest.ts'
import { registryIndexSchema } from './registry-index.ts'

/** The files authors write, by the file name of the JSON schema published for each. */
export const AUTHOR_FILE_SCHEMAS: Readonly<Record<string, z.ZodType>> = {
  'plugin.json': pluginManifestSchema,
  'categories.json': categoriesSchema,
  'registry.json': registryIndexSchema,
}

/** The JSON schema of what an author writes, before defaults and transforms apply. */
export const toAuthorJsonSchema = (schema: z.ZodType): z.core.JSONSchema.BaseSchema =>
  z.toJSONSchema(schema, { io: 'input' })
