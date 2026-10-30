/** A JSX attribute value: a string becomes `name="value"`, `true` a bare `name`. */
export type JsxAttributeValue = string | true

// A JSX string attribute has no escapes and decodes HTML entities, so such values become `{"…"}`.
const NEEDS_EXPRESSION = /["\n]|&#?\w+;/

export const renderJsxAttribute = (name: string, value: JsxAttributeValue): string => {
  if (value === true) {
    return name
  }
  return NEEDS_EXPRESSION.test(value) ? `${name}={${JSON.stringify(value)}}` : `${name}="${value}"`
}
