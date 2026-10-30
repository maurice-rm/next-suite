import { mkdir, writeFile } from 'node:fs/promises'

import * as z from 'zod'

import { categoriesSchema } from '../src/contract/category.ts'
import { pluginManifestSchema } from '../src/contract/plugin-manifest.ts'
import { registryIndexSchema } from '../src/contract/registry-index.ts'

const OUTPUT = new URL('../generated/schemas/', import.meta.url)

const writeJsonSchema = async (fileName: string, schema: z.ZodType): Promise<void> => {
  const jsonSchema = z.toJSONSchema(schema, { io: 'input' })
  await writeFile(new URL(fileName, OUTPUT), `${JSON.stringify(jsonSchema, null, 2)}\n`)
}

await mkdir(OUTPUT, { recursive: true })
await writeJsonSchema('plugin.json', pluginManifestSchema)
await writeJsonSchema('categories.json', categoriesSchema)
await writeJsonSchema('registry.json', registryIndexSchema)
