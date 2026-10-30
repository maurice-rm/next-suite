import { describe, expect, it } from 'vitest'
import type * as z from 'zod'

import { AUTHOR_FILE_SCHEMAS, toAuthorJsonSchema } from './json-schemas.ts'

type JsonSchema = z.core.JSONSchema.BaseSchema
type JsonSchemaEntry = z.core.JSONSchema._JSONSchema

const DEFS_PREFIX = '#/$defs/'
const NAMED_DEFINITION = /^[A-Z][A-Za-z]*$/

const isSchema = (value: unknown): value is JsonSchema =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const collectSchemas = (value: unknown): JsonSchema[] => {
  const children = typeof value === 'object' && value !== null ? Object.values(value) : []
  return [...(isSchema(value) ? [value] : []), ...children.flatMap(collectSchemas)]
}

const isDescribed = (entry: JsonSchemaEntry, root: JsonSchema): boolean => {
  if (typeof entry === 'boolean') {
    return false
  }
  const target = entry.$ref?.startsWith(DEFS_PREFIX)
    ? root.$defs?.[entry.$ref.slice(DEFS_PREFIX.length)]
    : undefined
  return entry.description !== undefined || (isSchema(target) && target.description !== undefined)
}

const undescribedProperties = (root: JsonSchema): string[] =>
  collectSchemas(root).flatMap(({ properties = {} }) =>
    Object.entries(properties)
      .filter(([, property]) => !isDescribed(property, root))
      .map(([name]) => name),
  )

const undescribedDefinitions = (root: JsonSchema): string[] =>
  Object.entries(root.$defs ?? {})
    .filter(([, definition]) => !isSchema(definition) || definition.description === undefined)
    .map(([name]) => name)

describe.each(Object.entries(AUTHOR_FILE_SCHEMAS))('the JSON schema of %s', (_, schema) => {
  const root = toAuthorJsonSchema(schema)

  it('describes itself, each named definition and each property', () => {
    expect(root.description).toBeDefined()
    expect(undescribedDefinitions(root)).toEqual([])
    expect(undescribedProperties(root)).toEqual([])
  })

  it('names its definitions after the public types', () => {
    expect(Object.keys(root.$defs ?? {}).filter((name) => !NAMED_DEFINITION.test(name))).toEqual([])
  })
})
