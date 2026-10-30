import type { Expression } from 'oxc-parser'

import { findDefaultExport, findObjectBehind, findVariableValue } from './find-object.ts'
import { addModuleImport, type ModuleImport } from './module-import.ts'
import { createObjectLiteral, type ObjectLiteral } from './object-literal.ts'
import { openSourceDocument, type RawEdit, type SourceDocument } from './source-document.ts'

const DEFAULT_EXPORT = 'the default export'

const insideParentheses = (expression: Expression): Expression =>
  expression.type === 'ParenthesizedExpression'
    ? insideParentheses(expression.expression)
    : expression

/**
 * Code operations on one TypeScript or TSX file. Each operation finds its place in the syntax tree
 * and edits only the text there: untouched code stays byte for byte, and inserted code copies the
 * file's indentation, quotes and semicolons. Every operation sees the edits before it.
 */
export type TypescriptModule = {
  /**
   * Adds an import, merged into an import of the same module where one exists; names imported
   * already are skipped. An import of a source path (`@/…`) joins the imports of source paths, or
   * starts a group of its own below the other imports.
   */
  addImport: (moduleImport: ModuleImport) => void
  /** The object literal the top-level variable holds, directly, through `satisfies`/`as` or as a call's argument. */
  object: (variableName: string) => ObjectLiteral
  /** The object literal behind `export default`, through variables and wrapper calls. */
  defaultExportObject: () => ObjectLiteral
  /** `export default x` becomes `export default wrapper(x)`; later wrappers go outside. */
  wrapDefaultExport: (wrapper: string) => void
  /** Adds a statement at the end of the file, after a blank line. */
  appendStatement: (code: string) => void
  /**
   * The escape hatch for what the operations miss: an edit on oxc's syntax tree with magic-string.
   * It ties the caller to both libraries.
   */
  editRaw: (change: RawEdit) => void
  /** The file's text with every edit applied. */
  print: () => string
}

/** The module operations on the text `document` holds. */
export const createTypescriptModule = (document: SourceDocument): TypescriptModule => ({
  addImport: (moduleImport) => {
    addModuleImport(document, moduleImport)
  },

  object: (variableName) => {
    const target = `variable "${variableName}"`
    return createObjectLiteral(document, {
      target,
      locate: (program) =>
        findObjectBehind(program, findVariableValue(program, variableName), target),
    })
  },

  defaultExportObject: () =>
    createObjectLiteral(document, {
      target: DEFAULT_EXPORT,
      locate: (program) => findObjectBehind(program, findDefaultExport(program), DEFAULT_EXPORT),
    }),

  wrapDefaultExport: (wrapper) => {
    document.edit(({ code, program }) => {
      const inner = insideParentheses(findDefaultExport(program))
      code.prependRight(inner.start, `${wrapper}(`)
      code.appendLeft(inner.end, ')')
    })
  },

  appendStatement: (statement) => {
    document.edit(({ code }) => {
      code.trimEnd().append(`\n\n${statement}\n`)
    })
  },

  editRaw: (change) => {
    document.edit(change)
  },

  print: () => document.print(),
})

/**
 * Opens a TypeScript or TSX file for code operations; the extension of `path` picks the dialect.
 *
 * @throws CodeEditError when the file does not parse.
 */
export const openTypescriptModule = (path: string, text: string): TypescriptModule =>
  createTypescriptModule(openSourceDocument(path, text))
