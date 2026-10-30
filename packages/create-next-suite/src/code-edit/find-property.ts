import type { ObjectExpression, ObjectProperty } from 'oxc-parser'

const keyOf = ({ key, computed }: ObjectProperty): string | undefined => {
  if (computed) {
    return undefined
  }
  if (key.type === 'Identifier') {
    return key.name
  }
  return key.type === 'Literal' && typeof key.value === 'string' ? key.value : undefined
}

/** The property `key` of an object literal, written as an identifier or a string. */
export const findProperty = (object: ObjectExpression, key: string): ObjectProperty | undefined =>
  object.properties.find(
    (property): property is ObjectProperty =>
      property.type === 'Property' && keyOf(property) === key,
  )
