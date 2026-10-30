import type { Program, Statement } from 'oxc-parser'

const DOUBLE_QUOTE = '"'
const SINGLE_QUOTE = "'"
const SEMICOLON = ';'

/** The quotes and semicolons generated code copies from the file it goes into. */
export type CodeStyle = { quote: typeof DOUBLE_QUOTE | typeof SINGLE_QUOTE; semicolon: string }

const DEFAULT_STYLE: CodeStyle = { quote: DOUBLE_QUOTE, semicolon: SEMICOLON }

/** A statement that ends in a semicolon where the file writes them. */
const isTerminated = (statement: Statement): boolean => {
  switch (statement.type) {
    case 'ImportDeclaration':
    case 'VariableDeclaration':
    case 'ExpressionStatement':
      return true
    case 'ExportNamedDeclaration':
      return statement.declaration === null || statement.declaration.type === 'VariableDeclaration'
    default:
      return false
  }
}

/** The quote of the first import's module or the first directive. */
const quoteOf = (text: string, program: Program): CodeStyle['quote'] => {
  for (const statement of program.body) {
    const literal =
      statement.type === 'ImportDeclaration'
        ? statement.source
        : statement.type === 'ExpressionStatement' && statement.directive != null
          ? statement.expression
          : undefined
    if (literal !== undefined) {
      return text[literal.start] === SINGLE_QUOTE ? SINGLE_QUOTE : DOUBLE_QUOTE
    }
  }
  return DEFAULT_STYLE.quote
}

/** Reads the style from the file's imports and directives, else from its first statement. */
export const detectCodeStyle = (text: string, program: Program): CodeStyle => {
  const terminated = program.body.find(isTerminated)
  return {
    quote: quoteOf(text, program),
    semicolon: terminated === undefined || text[terminated.end - 1] === SEMICOLON ? SEMICOLON : '',
  }
}

/** A string literal in the file's quotes. */
export const renderString = (value: string, { quote }: CodeStyle): string => {
  const doubleQuoted = JSON.stringify(value)
  if (quote === DOUBLE_QUOTE) {
    return doubleQuoted
  }
  const body = doubleQuoted.slice(1, -1).replaceAll('\\"', '"').replaceAll("'", "\\'")
  return `${SINGLE_QUOTE}${body}${SINGLE_QUOTE}`
}
