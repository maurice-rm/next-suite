import type { Comment, Span } from 'oxc-parser'

import { indentAt } from './indentation.ts'
import { reindent } from './reindent.ts'
import type { RawEditContext } from './source-document.ts'
import { hasLineBreak, lineEndOf, lineStartOf } from './text-lines.ts'

const COMMA = ','
const WHITESPACE = /\s/

/**
 * The entries between two brackets: object properties, array elements, import names. `open` is
 * the offset of the opening bracket, `close` the one of the closing bracket.
 */
export type BracketedList = {
  open: number
  close: number
  items: readonly Span[]
  /** How an empty list grows: objects open into lines, arrays and import names stay inline. */
  emptyLayout: 'lines' | 'inline'
}

/** The offset of the first character after `offset` that is neither whitespace nor a comment. */
const codeAfter = (text: string, offset: number, comments: readonly Comment[]): number => {
  let index = offset
  while (index < text.length) {
    const comment = comments.find(({ start }) => start === index)
    if (comment !== undefined) {
      index = comment.end
    } else if (WHITESPACE.test(text[index] ?? '')) {
      index += 1
    } else {
      return index
    }
  }
  return index
}

const startsLine = (text: string, item: Span): boolean =>
  text.slice(lineStartOf(text, item.start), item.start).trim() === ''

const hasCommaAfter = ({ text, comments }: RawEditContext, item: Span): boolean =>
  text[codeAfter(text, item.end, comments)] === COMMA

/** Fills a list without entries; a comment inside the brackets stays first. */
const fillEmpty = (context: RawEditContext, list: BracketedList, entries: string[]): void => {
  const { code, text, indentUnit } = context
  const inside = text.slice(list.open + 1, list.close).trim()
  if (list.emptyLayout === 'inline' && !hasLineBreak(text, list.open, list.close)) {
    const content = [inside, entries.join(', ')].filter((part) => part !== '').join(' ')
    code.overwrite(list.open, list.close + 1, `${text[list.open]}${content}${text[list.close]}`)
    return
  }
  const outer = indentAt(text, list.open)
  const inner = outer + indentUnit
  const lines = [
    ...(inside === '' ? [] : [`${inner}${inside}`]),
    ...entries.map((entry) => `${inner}${reindent(entry, inner, indentUnit)},`),
  ]
  code.overwrite(
    list.open,
    list.close + 1,
    `${text[list.open]}\n${lines.join('\n')}\n${outer}${text[list.close]}`,
  )
}

/**
 * Appends entries, each code, after the last one: one per line in a list that spans lines, after
 * the line of the last entry so its trailing comment stays where it is; inline otherwise. A
 * trailing comma stays a trailing comma, and none is added where the list has none.
 */
export const appendToList = (
  context: RawEditContext,
  list: BracketedList,
  entries: string[],
): void => {
  const { code, text, indentUnit } = context
  const last = list.items.at(-1)
  if (last === undefined) {
    fillEmpty(context, list, entries)
    return
  }
  const indent = indentAt(text, last.start)
  const placed = entries.map((entry) => reindent(entry, indent, indentUnit))
  if (!hasLineBreak(text, last.end, list.close)) {
    code.appendLeft(last.end, placed.map((entry) => `, ${entry}`).join(''))
    return
  }
  const isTrailing = hasCommaAfter(context, last)
  if (!isTrailing) {
    code.appendLeft(last.end, COMMA)
  }
  const lines = placed.map((entry) => `\n${indent}${entry}`)
  code.appendLeft(lineEndOf(text, last.end), lines.join(COMMA) + (isTrailing ? COMMA : ''))
}

/**
 * Removes the last entry, from the end of the line of the previous one when they are on two, so
 * that line keeps its comment; the comma the previous entry is left with goes where the list had
 * no trailing comma.
 */
const removeLast = (context: RawEditContext, list: BracketedList, item: Span): void => {
  const previous = list.items.at(-2)
  if (previous === undefined) {
    context.code.remove(list.open + 1, list.close)
    return
  }
  const { code, text, comments } = context
  if (!hasLineBreak(text, previous.end, item.start)) {
    code.remove(previous.end, item.end)
    return
  }
  const isTrailing = hasCommaAfter(context, item)
  code.remove(lineEndOf(text, previous.end), Math.min(lineEndOf(text, item.end), list.close))
  const comma = codeAfter(text, previous.end, comments)
  if (!isTrailing && text[comma] === COMMA) {
    code.remove(comma, comma + 1)
  }
}

/**
 * Removes an entry with its comma. An entry on lines of its own goes with those lines, so the
 * comment above the next entry stays; the last entry keeps the comment of the line before it.
 */
export const removeFromList = (context: RawEditContext, list: BracketedList, item: Span): void => {
  const { code, text } = context
  const next = list.items[list.items.indexOf(item) + 1]
  if (next === undefined) {
    removeLast(context, list, item)
  } else if (startsLine(text, item) && hasLineBreak(text, item.end, next.start)) {
    code.remove(lineStartOf(text, item.start), lineEndOf(text, item.end) + 1)
  } else {
    code.remove(item.start, next.start)
  }
}
