import { isJsonObject, type JsonValue } from './json-value.ts'

const LINE_WIDTH = 80
const INDENT = '  '

const isJsonArray = (value: JsonValue): value is readonly JsonValue[] => Array.isArray(value)

const formatInline = (value: JsonValue): string => {
  if (isJsonArray(value)) {
    return `[${value.map(formatInline).join(', ')}]`
  }
  if (isJsonObject(value)) {
    const entries = Object.entries(value).map(
      ([key, entry]) => `${JSON.stringify(key)}: ${formatInline(entry)}`,
    )
    return entries.length === 0 ? '{}' : `{ ${entries.join(', ')} }`
  }
  return JSON.stringify(value)
}

/** `value` at `depth`, its first line starting at column `column`. */
const formatAt = (value: JsonValue, depth: number, column: number): string => {
  const indent = INDENT.repeat(depth + 1)
  const closingIndent = INDENT.repeat(depth)
  if (isJsonArray(value)) {
    const inline = formatInline(value)
    if (value.length === 0 || column + inline.length <= LINE_WIDTH) {
      return inline
    }
    const items = value.map((item) => `${indent}${formatAt(item, depth + 1, indent.length)}`)
    return `[\n${items.join(',\n')}\n${closingIndent}]`
  }
  if (isJsonObject(value)) {
    const entries = Object.entries(value)
    if (entries.length === 0) {
      return '{}'
    }
    const lines = entries.map(([key, entry]) => {
      const prefix = `${indent}${JSON.stringify(key)}: `
      return `${prefix}${formatAt(entry, depth + 1, prefix.length)}`
    })
    return `{\n${lines.join(',\n')}\n${closingIndent}}`
  }
  return JSON.stringify(value)
}

/**
 * JSON the way create-next-app writes it: objects expanded, arrays on one line when they fit,
 * a line break at the end.
 */
export const formatJson = (value: JsonValue): string => `${formatAt(value, 0, 0)}\n`
