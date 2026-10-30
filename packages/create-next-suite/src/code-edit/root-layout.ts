import { findElement } from './find-element.ts'
import { continueLinesAt, dedentSnippet, indentAt } from './indentation.ts'
import { type JsxAttributeValue, renderJsxAttribute } from './jsx-attribute.ts'
import {
  CHILDREN,
  childTexts,
  findChildrenParent,
  insideOf,
  isChildrenSlot,
  isMeaningful,
  layOutChildren,
} from './jsx-children.ts'
import type { ObjectLiteral } from './object-literal.ts'
import { type ChildrenWrapper, orderWrappers } from './order-wrappers.ts'
import { openSourceDocument, type SourceDocument } from './source-document.ts'
import { hasLineBreak, isAloneOnLine } from './text-lines.ts'
import { createTypescriptModule, type TypescriptModule } from './typescript-module.ts'

const METADATA = 'metadata'

/** The module operations on `app/layout.tsx`, plus the JSX operations only the root layout needs. */
export type RootLayout = TypescriptModule & {
  /** The exported `metadata` object. */
  metadata: () => ObjectLiteral
  /**
   * Wraps `{children}` in each component, in order from outside to inside except where `inside`
   * says otherwise; wrappers of a later call go inside those of an earlier one.
   */
  wrapChildren: (wrappers: readonly ChildrenWrapper[]) => void
  /** Adds an element, which may span lines, as the last child of `<body>`. */
  appendToBody: (element: string) => void
  /** Sets an attribute of `<html>`, replacing one of the same name. */
  setHtmlAttribute: (name: string, value: JsxAttributeValue) => void
}

const renderAttributes = (props: ChildrenWrapper['props'] = {}): string =>
  Object.entries(props)
    .map(([name, value]) => ` ${renderJsxAttribute(name, value)}`)
    .join('')

const wrapChildrenOnce = (
  document: SourceDocument,
  { component, props }: ChildrenWrapper,
): void => {
  document.edit((context) => {
    const { code, text, program, indentUnit } = context
    const parent = findChildrenParent(findElement(program, 'body'), text)
    const wrapped = [
      `<${component}${renderAttributes(props)}>`,
      `${indentUnit}${CHILDREN}`,
      `</${component}>`,
    ].join('\n')
    const slot = parent.children.find((child) => isChildrenSlot(child, text))
    if (slot !== undefined && isAloneOnLine(text, slot.start, slot.end)) {
      code.overwrite(slot.start, slot.end, continueLinesAt(wrapped, indentAt(text, slot.start)))
      return
    }
    layOutChildren(context, parent, childTexts(parent, text, wrapped))
  })
}

/**
 * Opens the root layout for code operations.
 *
 * @throws CodeEditError when the file does not parse.
 */
export const openRootLayout = (path: string, text: string): RootLayout => {
  const document = openSourceDocument(path, text)
  const module = createTypescriptModule(document)

  return {
    ...module,

    metadata: () => module.object(METADATA),

    wrapChildren: (wrappers) => {
      for (const wrapper of orderWrappers(wrappers, path)) {
        wrapChildrenOnce(document, wrapper)
      }
    },

    appendToBody: (element) => {
      document.edit((context) => {
        const { code, text, program } = context
        const body = findElement(program, 'body')
        const snippet = dedentSnippet(element)
        const last = body.children.filter(isMeaningful).at(-1)
        const inside = insideOf(body)
        if (last === undefined || !hasLineBreak(text, inside.start, inside.end)) {
          layOutChildren(context, body, [...childTexts(body, text), snippet])
          return
        }
        const indent = indentAt(text, last.end)
        code.appendLeft(last.end, `\n${indent}${continueLinesAt(snippet, indent)}`)
      })
    },

    setHtmlAttribute: (name, value) => {
      document.edit(({ code, text, program }) => {
        const opening = findElement(program, 'html').openingElement
        const rendered = renderJsxAttribute(name, value)
        const existing = opening.attributes.find(
          (attribute) =>
            attribute.type === 'JSXAttribute' &&
            attribute.name.type === 'JSXIdentifier' &&
            attribute.name.name === name,
        )
        if (existing !== undefined) {
          code.overwrite(existing.start, existing.end, rendered)
          return
        }
        const last = opening.attributes.at(-1)
        const anchor = last ?? opening.name
        const isOnOwnLines = last !== undefined && hasLineBreak(text, opening.name.end, last.start)
        const separator = isOnOwnLines ? `\n${indentAt(text, anchor.start)}` : ' '
        code.appendLeft(anchor.end, `${separator}${rendered}`)
      })
    },
  }
}
