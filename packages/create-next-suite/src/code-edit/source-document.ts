import MagicString from 'magic-string'
import { type Comment, type Program, parseSync } from 'oxc-parser'

import { CodeEditError } from './code-edit-error.ts'
import { detectIndentUnit } from './indentation.ts'

/** What a question about a module reads: its current text and syntax tree. */
type SourceView = {
  /** The module's text before this edit; every offset in `program` and `comments` is one of it. */
  text: string
  /** The oxc syntax tree of `text`, in the ESTree / TS-ESTree shape. */
  program: Program
  comments: readonly Comment[]
  /** What the file indents by: a tab or a number of spaces. */
  indentUnit: string
}

/** What an edit gets: the view of the module and a magic-string to change it, by offsets of `text`. */
export type RawEditContext = SourceView & { code: MagicString }

/** An edit of a module through oxc's syntax tree and magic-string. */
export type RawEdit = (context: RawEditContext) => void

/**
 * A module's text that every edit changes and parses again, so the next edit sees the earlier
 * ones and a snippet that does not parse fails at the edit that inserted it.
 */
export type SourceDocument = {
  /** Applies one edit; a `CodeEditError` it throws gets the file's path in front. */
  edit: (change: RawEdit) => void
  /** Answers a question about the current text; a `CodeEditError` it throws gets the path. */
  inspect: <Answer>(question: (view: SourceView) => Answer) => Answer
  print: () => string
}

type Parsed = { program: Program; comments: readonly Comment[] }

const parse = (path: string, text: string): Parsed => {
  const { program, comments, errors } = parseSync(path, text)
  const [error] = errors
  if (error !== undefined) {
    throw new CodeEditError(`${path} does not parse: ${error.codeframe ?? error.message}`)
  }
  return { program, comments }
}

/** Runs `step`; a `CodeEditError` from it is thrown again with `path` in front. */
const withPathInErrors = <Result>(path: string, step: () => Result): Result => {
  try {
    return step()
  } catch (error) {
    if (error instanceof CodeEditError) {
      throw new CodeEditError(`${path}: ${error.message}`, { cause: error })
    }
    throw error
  }
}

/** Opens a module's text for edits; `path` picks the dialect by its extension and names errors. */
export const openSourceDocument = (path: string, initialText: string): SourceDocument => {
  const indentUnit = detectIndentUnit(initialText)
  let text = initialText
  let parsed = parse(path, text)

  return {
    edit: (change) => {
      const code = new MagicString(text)
      withPathInErrors(path, () => change({ text, ...parsed, indentUnit, code }))
      if (!code.hasChanged()) {
        return
      }
      const changed = code.toString()
      parsed = parse(path, changed)
      text = changed
    },
    inspect: (question) => withPathInErrors(path, () => question({ text, ...parsed, indentUnit })),
    print: () => text,
  }
}
