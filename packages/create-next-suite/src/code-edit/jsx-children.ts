import type { JSXChild, JSXElement, JSXFragment, Span } from 'oxc-parser'

import { CodeEditError } from './code-edit-error.ts'
import { continueLinesAt, indentAt } from './indentation.ts'
import type { RawEditContext } from './source-document.ts'

export const CHILDREN = '{children}'

/** What holds JSX children: an element or a fragment. */
type JsxParent = JSXElement | JSXFragment

export const isMeaningful = (child: JSXChild): boolean =>
  child.type !== 'JSXText' || child.value.trim() !== ''

export const isChildrenSlot = (child: JSXChild, text: string): boolean =>
  child.type === 'JSXExpressionContainer' && text.slice(child.start, child.end) === CHILDREN

const isJsxParent = (child: JSXChild): child is JsxParent =>
  child.type === 'JSXElement' || child.type === 'JSXFragment'

/** The element or fragment inside `root` that renders `{children}` directly, breadth first. */
export const findChildrenParent = (root: JSXElement, text: string): JsxParent => {
  const pending: JsxParent[] = [root]
  for (let parent = pending.shift(); parent !== undefined; parent = pending.shift()) {
    if (parent.children.some((child) => isChildrenSlot(child, text))) {
      return parent
    }
    pending.push(...parent.children.filter(isJsxParent))
  }
  throw new CodeEditError(`found no ${CHILDREN} inside <body>`)
}

/** The range between the opening and the closing tag. */
export const insideOf = (parent: JsxParent): Span => {
  if (parent.type === 'JSXFragment') {
    return { start: parent.openingFragment.end, end: parent.closingFragment.start }
  }
  if (parent.closingElement === null) {
    const { name } = parent.openingElement
    const tag = name.type === 'JSXIdentifier' ? `<${name.name}>` : 'the element'
    throw new CodeEditError(`${tag} is self-closing and takes no children`)
  }
  return { start: parent.openingElement.end, end: parent.closingElement.start }
}

/**
 * The code of each child that is not whitespace, its lines after the first relative to the first,
 * and `{children}` replaced by `replacement`.
 */
export const childTexts = (parent: JsxParent, text: string, replacement = CHILDREN): string[] =>
  parent.children.filter(isMeaningful).map((child) => {
    if (isChildrenSlot(child, text)) {
      return replacement
    }
    const indent = indentAt(text, child.start)
    return text.slice(child.start, child.end).trim().replaceAll(`\n${indent}`, '\n')
  })

/** Rewrites the children of a parent as one child per line, one level deeper than the parent. */
export const layOutChildren = (
  context: RawEditContext,
  parent: JsxParent,
  children: string[],
): void => {
  const { code, text, indentUnit } = context
  const outer = indentAt(text, parent.start)
  const inner = outer + indentUnit
  const lines = children.map((child) => `${inner}${continueLinesAt(child, inner)}`)
  const { start, end } = insideOf(parent)
  const content = `\n${lines.join('\n')}\n${outer}`
  if (start === end) {
    code.appendLeft(start, content)
    return
  }
  code.overwrite(start, end, content)
}
