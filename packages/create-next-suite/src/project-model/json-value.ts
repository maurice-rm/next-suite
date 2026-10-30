import { ProjectError } from './project-error.ts'

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue }

export type JsonObject = { readonly [key: string]: JsonValue }

export const isJsonObject = (value: unknown): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * The JSON object a file holds; `path` names the file in errors.
 *
 * @throws ProjectError when the text is no JSON or holds no object.
 */
export const parseJsonObject = (text: string, path: string): JsonObject => {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new ProjectError(`${path} is no valid JSON: ${error.message}`, { cause: error })
    }
    throw error
  }
  if (!isJsonObject(value)) {
    throw new ProjectError(`${path} holds no JSON object`)
  }
  return value
}
