import { type Expression, type ObjectExpression, type Program, parseSync } from 'oxc-parser'
import * as z from 'zod'

import { CodeEditError } from '../code-edit/code-edit-error.ts'
import { findDefaultExport, unwrapExpression } from '../code-edit/find-object.ts'
import {
  METADATA_FIELDS,
  type PluginMetadata,
  type PluginSummary,
  POINT_FIELDS,
  pointNamesOf,
} from './plugin-metadata.ts'
import { PluginMetadataError } from './plugin-metadata-error.ts'

/** A value written as a literal: what metadata may hold. */
type LiteralValue = string | boolean | readonly LiteralValue[] | { [key: string]: LiteralValue }

const PLUGIN_CONTRACT = 'create-next-suite/plugin'
const DEFINE_PLUGIN = 'definePlugin'
const METADATA_KEYS: ReadonlySet<string> = new Set(METADATA_FIELDS)
const POINT_KEYS: ReadonlySet<string> = new Set(POINT_FIELDS)
/** A plugin name, also its flag: lowercase, optionally scoped, such as `mail` or `@acme/mail`. */
const PLUGIN_NAME = /^(?:@[a-z0-9][a-z0-9-]*\/)?[a-z0-9][a-z0-9-]*$/

/**
 * Control and format characters, such as escape sequences or bidi overrides: in a title or a
 * question, a terminal would run them, and could hide what the trust question says.
 */
const CONTROL_CHARACTER = /[\p{Cc}\p{Cf}]/u

const text = z.string().min(1)
const choiceSchema = z.union([
  text,
  z.strictObject({
    value: text,
    label: text.optional(),
    description: text.optional(),
  }),
])
const questionFields = { question: text, description: text.optional() }
const choiceValue = (choice: z.output<typeof choiceSchema>): string =>
  typeof choice === 'string' ? choice : choice.value
const optionSchema = z
  .union([
    z.strictObject({
      ...questionFields,
      type: z.literal('boolean'),
      default: z.boolean(),
    }),
    z.strictObject({
      ...questionFields,
      type: z.literal('select').optional(),
      choices: z.array(choiceSchema).min(1),
      default: text,
    }),
    z.strictObject({
      ...questionFields,
      type: z.literal('multiselect'),
      choices: z.array(choiceSchema).min(1),
      default: z.array(text),
    }),
  ])
  .refine(
    (option) =>
      !('choices' in option) ||
      [option.default].flat().every((value) => option.choices.map(choiceValue).includes(value)),
    'the default must be one of the choices',
  )
const metadataSchema = z.object({
  name: z.string().regex(PLUGIN_NAME, 'use a lowercase name such as `mail` or `@acme/mail`'),
  title: text,
  description: text.optional(),
  category: text.optional(),
  section: text.optional(),
  replaces: text.optional(),
  conflicts: z.record(z.string(), text).optional(),
  options: z.record(z.string(), optionSchema).optional(),
})

const fail = (message: string): never => {
  throw new PluginMetadataError(message)
}

const printable = (value: string, field: string): string =>
  CONTROL_CHARACTER.test(value) ? fail(`${field} holds a control character`) : value

const keyOf = (property: ObjectExpression['properties'][number], field: string): string => {
  if (property.type === 'SpreadElement') {
    return fail(`${field} spreads another object; write its keys out`)
  }
  if (!property.computed && property.key.type === 'Identifier') {
    return printable(property.key.name, `${field} has a key that`)
  }
  if (property.key.type === 'Literal' && typeof property.key.value === 'string') {
    return printable(property.key.value, `${field} has a key that`)
  }
  return fail(`${field} has a key that is no fixed name`)
}

const notFixed = (field: string, expression: Expression): never =>
  fail(
    `${field} is no fixed value (found ${expression.type}); metadata is written as literals, so it can be read without running the plugin`,
  )

/** The value of a literal expression; anything that needs running the code fails. */
const readLiteral = (start: Expression, field: string): LiteralValue => {
  const expression = unwrapExpression(start)
  switch (expression.type) {
    case 'Literal':
      if (typeof expression.value === 'string') {
        return printable(expression.value, field)
      }
      return typeof expression.value === 'boolean' ? expression.value : notFixed(field, expression)
    case 'TemplateLiteral':
      return expression.expressions.length === 0 && expression.quasis[0]?.value.cooked != null
        ? printable(expression.quasis[0].value.cooked, field)
        : notFixed(field, expression)
    case 'ArrayExpression':
      return expression.elements.map((element, index) =>
        element === null || element.type === 'SpreadElement'
          ? fail(`${field}[${index}] is no fixed value`)
          : readLiteral(element, `${field}[${index}]`),
      )
    case 'ObjectExpression':
      return readObject(expression, field)
    default:
      return notFixed(field, expression)
  }
}

const readObject = (object: ObjectExpression, field: string): { [key: string]: LiteralValue } =>
  Object.fromEntries(
    object.properties.map((property) => {
      const key = keyOf(property, field)
      if (property.type !== 'Property' || property.kind !== 'init' || property.method) {
        return fail(`${field}.${key} is no fixed value; metadata is written as literals`)
      }
      return [key, readLiteral(property.value, `${field}.${key}`)]
    }),
  )

const objectLiteral = (start: Expression, field: string): ObjectExpression => {
  const expression = unwrapExpression(start)
  return expression.type === 'ObjectExpression'
    ? expression
    : fail(`${field} is no object literal (found ${expression.type})`)
}

/** The local name `definePlugin` is imported under from the plugin contract, if it is. */
const definePluginName = (program: Program): string | undefined => {
  for (const statement of program.body) {
    if (statement.type !== 'ImportDeclaration' || statement.source.value !== PLUGIN_CONTRACT) {
      continue
    }
    const specifier = statement.specifiers.find(
      (candidate) =>
        candidate.type === 'ImportSpecifier' &&
        (candidate.imported.type === 'Identifier'
          ? candidate.imported.name
          : candidate.imported.value) === DEFINE_PLUGIN,
    )
    if (specifier !== undefined) {
      return specifier.local.name
    }
  }
  return undefined
}

/** The object literal `export default definePlugin({…})` passes. */
const findDefinition = (program: Program): ObjectExpression => {
  const expected = `export default ${DEFINE_PLUGIN}({…}) with ${DEFINE_PLUGIN} imported from ${PLUGIN_CONTRACT}`
  const exported = (() => {
    try {
      return unwrapExpression(findDefaultExport(program))
    } catch (error) {
      if (error instanceof CodeEditError) {
        return fail(`it has no ${expected}`)
      }
      throw error
    }
  })()
  const name = definePluginName(program)
  if (
    exported.type !== 'CallExpression' ||
    exported.callee.type !== 'Identifier' ||
    exported.callee.name !== name
  ) {
    return fail(`its default export is no ${expected}`)
  }
  const [argument] = exported.arguments
  if (argument === undefined || argument.type === 'SpreadElement') {
    return fail(`${DEFINE_PLUGIN} gets no object literal`)
  }
  return objectLiteral(argument, DEFINE_PLUGIN)
}

const validate = (value: Record<string, LiteralValue>): PluginMetadata => {
  const parsed = metadataSchema.safeParse(value)
  if (!parsed.success) {
    const problems = parsed.error.issues.map(
      (issue) => `${['metadata', ...issue.path.map(String)].join('.')}: ${issue.message}`,
    )
    return fail(`its metadata is invalid:\n${problems.join('\n')}`)
  }
  // The schema checked every field; the literal is kept as written, without zod's undefined keys.
  return value as PluginMetadata
}

/**
 * Reads the metadata of a plugin from the text of its `plugin.ts` without running it: the fields
 * the questions need as literals, and the names of the points it uses, provides, collects and
 * extends. Every other field is left unread.
 *
 * @throws PluginMetadataError when the file does not parse, has no default export of
 * `definePlugin({…})`, writes metadata as anything but literals, or the metadata is invalid.
 */
export const readPluginMetadata = (path: string, source: string): PluginSummary => {
  const { program, errors } = parseSync(path, source)
  const [error] = errors
  if (error !== undefined) {
    return fail(`it does not parse: ${error.codeframe ?? error.message}`)
  }
  const metadata: Record<string, LiteralValue> = {}
  const points = new Map<string, string[]>()
  for (const property of findDefinition(program).properties) {
    const key = keyOf(property, DEFINE_PLUGIN)
    if (property.type !== 'Property') {
      continue
    }
    if (METADATA_KEYS.has(key)) {
      metadata[key] = readLiteral(property.value, key)
    } else if (POINT_KEYS.has(key)) {
      points.set(
        key,
        objectLiteral(property.value, key).properties.map((point) => keyOf(point, key)),
      )
    }
  }
  return { metadata: validate(metadata), points: pointNamesOf((field) => points.get(field) ?? []) }
}
