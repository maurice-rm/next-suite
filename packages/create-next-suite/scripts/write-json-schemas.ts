import { mkdir, writeFile } from 'node:fs/promises'

import { AUTHOR_FILE_SCHEMAS, toAuthorJsonSchema } from '../src/contract/json-schemas.ts'

const OUTPUT = new URL('../generated/schemas/', import.meta.url)

await mkdir(OUTPUT, { recursive: true })
for (const [fileName, schema] of Object.entries(AUTHOR_FILE_SCHEMAS)) {
  const jsonSchema = toAuthorJsonSchema(schema)
  await writeFile(new URL(fileName, OUTPUT), `${JSON.stringify(jsonSchema, null, 2)}\n`)
}
