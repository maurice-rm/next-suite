import type { Expression, ObjectExpression, Program } from 'oxc-parser'

import { CodeEditError } from './code-edit-error.ts'

/** The value of the top-level variable `name`, exported or not. */
export const findVariableValue = (program: Program, name: string): Expression => {
  for (const statement of program.body) {
    const declaration =
      statement.type === 'ExportNamedDeclaration' ? statement.declaration : statement
    if (declaration?.type !== 'VariableDeclaration') {
      continue
    }
    const declarator = declaration.declarations.find(
      ({ id }) => id.type === 'Identifier' && id.name === name,
    )
    if (declarator?.init != null) {
      return declarator.init
    }
  }
  throw new CodeEditError(`found no top-level variable "${name}" with a value`)
}

/** The expression behind `export default`. */
export const findDefaultExport = (program: Program): Expression => {
  const exported = program.body.find((statement) => statement.type === 'ExportDefaultDeclaration')
  if (exported === undefined) {
    throw new CodeEditError('found no default export')
  }
  const { declaration } = exported
  if (
    declaration.type === 'FunctionDeclaration' ||
    declaration.type === 'ClassDeclaration' ||
    declaration.type === 'TSInterfaceDeclaration'
  ) {
    throw new CodeEditError(`the default export is no expression (found ${declaration.type})`)
  }
  return declaration
}

/** The expression inside parentheses and `satisfies` / `as` / `!` / `<Type>`. */
export const unwrapExpression = (expression: Expression): Expression => {
  let current = expression
  while (
    current.type === 'ParenthesizedExpression' ||
    current.type === 'TSSatisfiesExpression' ||
    current.type === 'TSAsExpression' ||
    current.type === 'TSNonNullExpression' ||
    current.type === 'TSTypeAssertion'
  ) {
    current = current.expression
  }
  return current
}

/**
 * The object literal an expression stands for, looking through wrappers (`unwrapExpression`),
 * variables (`nextConfig`) and calls (`withMdx({…})`, `pino({…})`: the first argument). `target`
 * names the expression in errors, such as `variable "logger"`.
 */
export const findObjectBehind = (
  program: Program,
  start: Expression,
  target: string,
): ObjectExpression => {
  const visited = new Set<string>()
  let expression = unwrapExpression(start)
  while (expression.type !== 'ObjectExpression') {
    if (expression.type === 'CallExpression') {
      const [argument] = expression.arguments
      if (argument === undefined || argument.type === 'SpreadElement') {
        throw new CodeEditError(`${target} is a call without an object literal argument`)
      }
      expression = unwrapExpression(argument)
    } else if (expression.type === 'Identifier' && !visited.has(expression.name)) {
      visited.add(expression.name)
      expression = unwrapExpression(findVariableValue(program, expression.name))
    } else {
      throw new CodeEditError(`${target} is no object literal (found ${expression.type})`)
    }
  }
  return expression
}
