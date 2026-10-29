import Handlebars from 'handlebars'

import { TemplateError } from './template-error.ts'

export type BlockHelper = 'if' | 'unless' | 'each'

/** Plugin templates may use every block; files of the base project may not branch. */
export const PLUGIN_TEMPLATE_BLOCKS: readonly BlockHelper[] = ['if', 'unless', 'each']
export const BASE_TEMPLATE_BLOCKS: readonly BlockHelper[] = ['each']

const CONDITION_BLOCKS: ReadonlySet<string> = new Set(['if', 'unless'])

type Node = hbs.AST.Node

const position = (node: Node): string =>
  `line ${node.loc.start.line}, column ${node.loc.start.column + 1}`

const fail = (node: Node, problem: string): never => {
  throw new TemplateError(`${problem} (${position(node)})`)
}

const hasArguments = (node: { params: unknown[]; hash?: hbs.AST.Hash }): boolean =>
  node.params.length > 0 || (node.hash?.pairs.length ?? 0) > 0

const isFactQuery = (expression: hbs.AST.Expression): boolean => {
  if (expression.type !== 'SubExpression') {
    return false
  }
  const query = expression as hbs.AST.SubExpression
  const [fact] = query.params
  return (
    query.path.original === 'has' &&
    query.params.length === 1 &&
    fact?.type === 'StringLiteral' &&
    (query.hash?.pairs.length ?? 0) === 0
  )
}

const checkBlock = (block: hbs.AST.BlockStatement, allowedBlocks: readonly BlockHelper[]): void => {
  const helper = block.path.original
  if (!allowedBlocks.some((allowed) => allowed === helper)) {
    fail(block, `the block {{#${helper}}} is not allowed here`)
  }
  const [argument] = block.params
  if (block.params.length !== 1 || argument === undefined || (block.hash?.pairs.length ?? 0) > 0) {
    fail(block, `{{#${helper}}} takes exactly one argument`)
  }
  if (CONDITION_BLOCKS.has(helper) && argument !== undefined && !isFactQuery(argument)) {
    fail(
      block,
      `{{#${helper}}} asks a named fact only, such as {{#${helper} (has "plugin:drizzle")}}`,
    )
  }
  if (helper === 'each' && argument?.type !== 'PathExpression') {
    fail(block, '{{#each}} iterates over a value, such as {{#each items}}')
  }
  if (helper === 'each' && block.inverse) {
    fail(block, '{{#each}} takes no {{else}}, which would branch on the value')
  }
  if ((block.program.blockParams?.length ?? 0) > 0) {
    fail(block, `{{#${helper}}} takes no block parameters such as "as |item|"; use {{this}}`)
  }
}

const checkMustache = (mustache: hbs.AST.MustacheStatement): void => {
  if (
    mustache.path.type !== 'PathExpression' ||
    hasArguments(mustache) ||
    (mustache.path as hbs.AST.PathExpression).original === 'has'
  ) {
    fail(mustache, 'only plain values such as {{project.name}} are allowed, no helpers')
  }
}

const checkProgram = (program: hbs.AST.Program, allowedBlocks: readonly BlockHelper[]): void => {
  for (const statement of program.body) {
    switch (statement.type) {
      case 'ContentStatement':
      case 'CommentStatement':
        break
      case 'MustacheStatement':
        checkMustache(statement as hbs.AST.MustacheStatement)
        break
      case 'BlockStatement': {
        const block = statement as hbs.AST.BlockStatement
        checkBlock(block, allowedBlocks)
        checkProgram(block.program, allowedBlocks)
        if (block.inverse) {
          checkProgram(block.inverse, allowedBlocks)
        }
        break
      }
      default:
        fail(statement, `${statement.type} is not allowed in templates`)
    }
  }
}

/**
 * Checks a template against the template rules before it renders: plain values, the given blocks,
 * and conditions that ask a named fact through `has`. Partials, decorators and every other helper
 * are rejected.
 */
export const checkTemplate = (source: string, allowedBlocks: readonly BlockHelper[]): void => {
  let program: hbs.AST.Program
  try {
    program = Handlebars.parse(source)
  } catch (error) {
    throw new TemplateError('the template is not valid Handlebars', { cause: error })
  }
  checkProgram(program, allowedBlocks)
}
