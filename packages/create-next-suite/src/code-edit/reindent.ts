const OPENERS = '{[('
const CLOSERS = '}])'
const QUOTES = `"'\``
const TEMPLATE_QUOTE = '`'
const ESCAPE = '\\'
const LINE_COMMENT = '//'
const LEADING_CLOSERS = /^[}\])]+/

type BracketState = { depth: number; isInTemplate: boolean }

const depthChange = (character: string): number => {
  if (OPENERS.includes(character)) {
    return 1
  }
  return CLOSERS.includes(character) ? -1 : 0
}

/** The offset of the quote that closes a string opened before `from`, or -1 on a later line. */
const closingQuoteOf = (line: string, from: number, quote: string): number => {
  for (let index = from; index < line.length; index += 1) {
    if (line[index] === ESCAPE) {
      index += 1
    } else if (line[index] === quote) {
      return index
    }
  }
  return -1
}

/** Counts the brackets of one line outside strings and line comments. */
const scanBrackets = (line: string, state: BracketState): void => {
  let index = state.isInTemplate ? closingQuoteOf(line, 0, TEMPLATE_QUOTE) + 1 : 0
  if (index === 0 && state.isInTemplate) {
    return
  }
  state.isInTemplate = false
  for (; index < line.length && !line.startsWith(LINE_COMMENT, index); index += 1) {
    const character = line[index] ?? ''
    if (!QUOTES.includes(character)) {
      state.depth += depthChange(character)
      continue
    }
    index = closingQuoteOf(line, index + 1, character)
    if (index === -1) {
      state.isInTemplate = character === TEMPLATE_QUOTE
      return
    }
  }
}

/**
 * Indents a snippet by its bracket depth, for code placed after `indent` on its first line: a
 * caller writes `{\ndefault: "x",\n}` and gets the nesting of a hand-written file. Lines inside a
 * template literal stay as they are.
 */
export const reindent = (code: string, indent: string, unit: string): string => {
  const state: BracketState = { depth: 0, isInTemplate: false }
  return code
    .split('\n')
    .map((line, index) => {
      const { depth, isInTemplate } = state
      scanBrackets(line, state)
      const trimmed = line.trim()
      if (index === 0 || isInTemplate) {
        return line
      }
      if (trimmed === '') {
        return ''
      }
      const closers = LEADING_CLOSERS.exec(trimmed)?.[0].length ?? 0
      return `${indent}${unit.repeat(Math.max(0, depth - closers))}${trimmed}`
    })
    .join('\n')
}
