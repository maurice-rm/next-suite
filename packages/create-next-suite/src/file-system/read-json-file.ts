import { readFile } from 'node:fs/promises'

import * as z from 'zod'

/** Builds the error for JSON that cannot be used, from a problem such as "is not valid JSON". */
export type JsonErrorFactory = (problem: string, options?: ErrorOptions) => Error

/** Checks a value against a schema and answers its output, or throws with every issue listed. */
export const parseWith = <Schema extends z.ZodType>(
  value: unknown,
  schema: Schema,
  toError: JsonErrorFactory,
): z.output<Schema> => {
  const parsed = schema.safeParse(value)
  if (!parsed.success) {
    throw toError(`is invalid\n${z.prettifyError(parsed.error)}`)
  }
  return parsed.data
}

export const parseJsonWith = <Schema extends z.ZodType>(
  text: string,
  schema: Schema,
  toError: JsonErrorFactory,
): z.output<Schema> => {
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch (error) {
    throw toError('is not valid JSON', { cause: error })
  }
  return parseWith(json, schema, toError)
}

/** Reads a JSON file and checks it against a schema; an unreadable file fails as it is. */
export const readJsonFile = async <Schema extends z.ZodType>(
  path: string,
  schema: Schema,
  toError: JsonErrorFactory,
): Promise<z.output<Schema>> => parseJsonWith(await readFile(path, 'utf8'), schema, toError)
