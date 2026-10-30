import { type JSXElement, type Program, Visitor } from 'oxc-parser'

import { CodeEditError } from './code-edit-error.ts'

/** The first JSX element with the tag `name`, in source order. */
export const findElement = (program: Program, name: string): JSXElement => {
  let found: JSXElement | undefined
  const visitElement = (element: JSXElement): void => {
    const tag = element.openingElement.name
    if (found === undefined && tag.type === 'JSXIdentifier' && tag.name === name) {
      found = element
    }
  }
  new Visitor({ JSXElement: visitElement }).visit(program)
  if (found === undefined) {
    throw new CodeEditError(`found no <${name}> element`)
  }
  return found
}
