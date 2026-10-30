import type { ArrayExpression, Expression, ObjectExpression, Program } from 'oxc-parser'

import { appendToList, type BracketedList, removeFromList } from './bracketed-list.ts'
import { CodeEditError } from './code-edit-error.ts'
import { detectCodeStyle } from './code-style.ts'
import { findObjectBehind, unwrapExpression } from './find-object.ts'
import { findProperty } from './find-property.ts'
import { indentAt } from './indentation.ts'
import { renderPropertyName } from './property-name.ts'
import { reindent } from './reindent.ts'
import type { RawEditContext, SourceDocument } from './source-document.ts'

const EMPTY_OBJECT = '{}'
const EMPTY_ARRAY = '[]'

/** Operations on an object literal in a module, such as a config object or the one in `pino({…})`. */
export type ObjectLiteral = {
  /**
   * The code of the value of the property `key`, the whole method for a method, or `undefined`
   * when the object has no such property.
   */
  get: (key: string) => string | undefined
  /**
   * Sets the property `key` to `code`. An existing property is replaced, a method or shorthand
   * included; a new one goes after the last property. Code that spans lines is indented by its
   * brackets.
   */
  set: (key: string, code: string) => void
  /** The object literal the property `key` holds; a missing property is added as `{}`. */
  object: (key: string) => ObjectLiteral
  /**
   * Appends elements, each code, to the array the property `key` holds; elements present already
   * are kept once, and a missing property is added as an array.
   */
  addToArray: (key: string, ...elements: string[]) => void
  /** Removes the element `code` from the array the property `key` holds, if it is there. */
  removeFromArray: (key: string, element: string) => void
}

/**
 * Finds the object again in each syntax tree, since every edit parses the module anew. `target`
 * names the object in errors, such as `variable "logger"`.
 */
type ObjectLocator = { target: string; locate: (program: Program) => ObjectExpression }

const propertiesOf = (object: ObjectExpression): BracketedList => ({
  open: object.start,
  close: object.end - 1,
  items: object.properties,
  emptyLayout: 'lines',
})

const elementsOf = (array: ArrayExpression): BracketedList => ({
  open: array.start,
  close: array.end - 1,
  items: array.elements.filter((element) => element !== null),
  emptyLayout: 'inline',
})

const describeProperty = (key: string, locator: ObjectLocator): string =>
  `property "${key}" of ${locator.target}`

/** The value of the property `key`, which must be there. */
const propertyValueOf = (object: ObjectExpression, key: string, target: string): Expression => {
  const property = findProperty(object, key)
  if (property === undefined) {
    throw new CodeEditError(`found no ${target}`)
  }
  return property.value
}

const arrayOf = (object: ObjectExpression, key: string, target: string): ArrayExpression => {
  const value = unwrapExpression(propertyValueOf(object, key, target))
  if (value.type !== 'ArrayExpression') {
    throw new CodeEditError(`${target} is no array literal (found ${value.type})`)
  }
  return value
}

/** `key: code`, the key quoted in the file's quotes where it is no identifier. */
const renderProperty = ({ text, program }: RawEditContext, key: string, code: string): string =>
  `${renderPropertyName(key, detectCodeStyle(text, program))}: ${code}`

/** The object literal operations as edits of the module `document` holds. */
export const createObjectLiteral = (
  document: SourceDocument,
  locator: ObjectLocator,
): ObjectLiteral => {
  const addMissing = (key: string, emptyCode: string): void => {
    document.edit((context) => {
      const object = locator.locate(context.program)
      if (findProperty(object, key) === undefined) {
        appendToList(context, propertiesOf(object), [renderProperty(context, key, emptyCode)])
      }
    })
  }

  return {
    get: (key) =>
      document.inspect(({ text, program }) => {
        const property = findProperty(locator.locate(program), key)
        if (property === undefined) {
          return undefined
        }
        const isWholeProperty = property.method || property.kind !== 'init'
        const { start, end } = isWholeProperty ? property : property.value
        return text.slice(start, end)
      }),

    set: (key, code) => {
      document.edit((context) => {
        const object = locator.locate(context.program)
        const property = findProperty(object, key)
        if (property === undefined) {
          appendToList(context, propertiesOf(object), [renderProperty(context, key, code)])
          return
        }
        const { text, indentUnit } = context
        const value = reindent(code, indentAt(text, property.start), indentUnit)
        if (property.shorthand || property.method || property.kind !== 'init') {
          const name = text.slice(property.key.start, property.key.end)
          context.code.overwrite(property.start, property.end, `${name}: ${value}`)
          return
        }
        context.code.overwrite(property.value.start, property.value.end, value)
      })
    },

    object: (key) => {
      addMissing(key, EMPTY_OBJECT)
      const target = describeProperty(key, locator)
      return createObjectLiteral(document, {
        target,
        locate: (program) =>
          findObjectBehind(program, propertyValueOf(locator.locate(program), key, target), target),
      })
    },

    addToArray: (key, ...elements) => {
      addMissing(key, EMPTY_ARRAY)
      const target = describeProperty(key, locator)
      document.edit((context) => {
        const array = elementsOf(arrayOf(locator.locate(context.program), key, target))
        const present = new Set(array.items.map(({ start, end }) => context.text.slice(start, end)))
        const added = [...new Set(elements)].filter((element) => !present.has(element))
        if (added.length > 0) {
          appendToList(context, array, added)
        }
      })
    },

    removeFromArray: (key, element) => {
      const target = describeProperty(key, locator)
      document.edit((context) => {
        const object = locator.locate(context.program)
        if (findProperty(object, key) === undefined) {
          return
        }
        const array = elementsOf(arrayOf(object, key, target))
        const item = array.items.find(
          ({ start, end }) => context.text.slice(start, end) === element,
        )
        if (item !== undefined) {
          removeFromList(context, array, item)
        }
      })
    },
  }
}
