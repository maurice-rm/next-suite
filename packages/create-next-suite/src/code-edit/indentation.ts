import { lineStartOf } from './text-lines.ts'

const DEFAULT_INDENT_UNIT = '  '
const LEADING_WHITESPACE = /^[ \t]*/
const TAB_INDENTED_LINE = /^\t/gm
// A line starting with `*` continues a block comment and sits one space off the code's indentation.
const SPACE_INDENTED_LINE = /^( +)[^\s*]/gm
const CLOSING_LINE = /^\s*(<\/|\/>|[}\])])/

/**
 * A tab when more lines start with a tab than with spaces, so a tab inside a template literal does
 * not decide; else the smallest indentation in spaces.
 */
export const detectIndentUnit = (text: string): string => {
  const tabLines = text.match(TAB_INDENTED_LINE)?.length ?? 0
  const widths = [...text.matchAll(SPACE_INDENTED_LINE)].map((match) => match[1]?.length ?? 0)
  if (tabLines > 0 && tabLines >= widths.length) {
    return '\t'
  }
  return widths.length === 0 ? DEFAULT_INDENT_UNIT : ' '.repeat(Math.min(...widths))
}

/** The whitespace the line holding `offset` starts with. */
export const indentAt = (text: string, offset: number): string =>
  LEADING_WHITESPACE.exec(text.slice(lineStartOf(text, offset)))?.[0] ?? ''

/** Continues every line of `code` after the first at `indent`, for code placed on such a line. */
export const continueLinesAt = (code: string, indent: string): string =>
  code.replaceAll('\n', `\n${indent}`)

/**
 * Makes the lines of a snippet after the first relative to it. A snippet written inside indented
 * source ends in a line such as `</Footer>` that belongs at the depth of the first line; its
 * indentation is taken away from every following line.
 */
export const dedentSnippet = (snippet: string): string => {
  const lines = snippet.split('\n')
  const last = lines.at(-1) ?? ''
  if (lines.length < 2 || !CLOSING_LINE.test(last)) {
    return snippet
  }
  const base = LEADING_WHITESPACE.exec(last)?.[0] ?? ''
  return lines.map((line) => (line.startsWith(base) ? line.slice(base.length) : line)).join('\n')
}
