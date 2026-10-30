import { type StringLiteral, Visitor } from 'oxc-parser'

import { openSourceDocument } from './source-document.ts'

type SpecifierNode = { source: unknown }

const isStringLiteral = (node: unknown): node is StringLiteral =>
  typeof node === 'object' &&
  node !== null &&
  'type' in node &&
  node.type === 'Literal' &&
  'value' in node &&
  typeof node.value === 'string'

/**
 * The file's text with the module specifier of every import, re-export, dynamic `import()`, type
 * `import()` and `import x = require()` replaced by what `rewrite` returns for it; strings and comments elsewhere stay as they are.
 *
 * @throws CodeEditError when the file does not parse.
 */
export const rewriteModuleSpecifiers = (
  path: string,
  text: string,
  rewrite: (specifier: string) => string,
): string => {
  const document = openSourceDocument(path, text)
  document.edit(({ code, program }) => {
    const rewriteSource = ({ source }: SpecifierNode): void => {
      if (!isStringLiteral(source)) {
        return
      }
      const rewritten = rewrite(source.value)
      if (rewritten !== source.value) {
        const quote = code.original.charAt(source.start)
        code.overwrite(source.start, source.end, `${quote}${rewritten}${quote}`)
      }
    }
    const rewriteRequire = ({ expression }: { expression: unknown }): void => {
      rewriteSource({ source: expression })
    }
    new Visitor({
      ImportDeclaration: rewriteSource,
      ExportNamedDeclaration: rewriteSource,
      ExportAllDeclaration: rewriteSource,
      ImportExpression: rewriteSource,
      TSImportType: rewriteSource,
      TSExternalModuleReference: rewriteRequire,
    }).visit(program)
  })
  return document.print()
}
