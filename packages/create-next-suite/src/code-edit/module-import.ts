import type {
  ImportDeclaration,
  ImportDeclarationSpecifier,
  ImportSpecifier,
  Program,
  Statement,
} from 'oxc-parser'

import { appendToList } from './bracketed-list.ts'
import { CodeEditError } from './code-edit-error.ts'
import { type CodeStyle, detectCodeStyle } from './code-style.ts'
import type { RawEditContext, SourceDocument } from './source-document.ts'
import { lineEndOf, lineStartOf } from './text-lines.ts'

const OPENING_BRACE = '{'
const IMPORT_KEYWORD = 'import'
const TYPE_KEYWORD = 'type'
const WHITESPACE = /\s/

/**
 * An import to add: named ones (`names`), a default one (`defaultName`), both, or neither for a
 * bare import such as a stylesheet. A type-only import takes names only.
 */
export type ModuleImport =
  | { from: string; names?: readonly string[]; defaultName?: string; isTypeOnly?: false }
  | { from: string; names: readonly string[]; isTypeOnly: true }

/** What the module does not import yet of a requested import. */
type MissingBindings = { names: string[]; defaultName: string | undefined }

const importsOf = (program: Program): ImportDeclaration[] =>
  program.body.filter((statement) => statement.type === 'ImportDeclaration')

const isNamed = (specifier: ImportDeclarationSpecifier): specifier is ImportSpecifier =>
  specifier.type === 'ImportSpecifier'

const importedName = ({ imported }: ImportSpecifier): string =>
  imported.type === 'Identifier' ? imported.name : imported.value

const isTypeOnlyImport = (declaration: ImportDeclaration): boolean =>
  declaration.importKind === 'type'

/** A named import that binds `name` to the export `name`; another export bound as `name` is refused. */
const bindsName = (specifier: ImportDeclarationSpecifier, name: string, from: string): boolean => {
  if (!isNamed(specifier) || specifier.local.name !== name) {
    return false
  }
  if (importedName(specifier) !== name) {
    throw new CodeEditError(`${name} is imported from "${from}" as another export already`)
  }
  return true
}

const isTypeBinding = (declaration: ImportDeclaration, specifier: ImportSpecifier): boolean =>
  isTypeOnlyImport(declaration) || specifier.importKind === 'type'

/** Whether `name` is imported from the declarations as a value, or at all for a type. */
const isImported = (
  declarations: readonly ImportDeclaration[],
  name: string,
  { from, isTypeOnly }: ModuleImport,
): boolean =>
  declarations.some((declaration) =>
    declaration.specifiers.some(
      (specifier) =>
        bindsName(specifier, name, from) &&
        isNamed(specifier) &&
        (isTypeOnly === true || !isTypeBinding(declaration, specifier)),
    ),
  )

const findMissing = (
  declarations: readonly ImportDeclaration[],
  moduleImport: ModuleImport,
): MissingBindings => {
  const names = [...new Set(moduleImport.names ?? [])].filter(
    (name) => !isImported(declarations, name, moduleImport),
  )
  const requestedDefault = moduleImport.isTypeOnly === true ? undefined : moduleImport.defaultName
  const existingDefault = declarations
    .flatMap(({ specifiers }) => specifiers)
    .find((specifier) => specifier.type === 'ImportDefaultSpecifier')?.local.name
  if (requestedDefault === undefined || requestedDefault === existingDefault) {
    return { names, defaultName: undefined }
  }
  if (existingDefault !== undefined) {
    throw new CodeEditError(
      `the default export of "${moduleImport.from}" is imported as ${existingDefault} already, not as ${requestedDefault}`,
    )
  }
  return { names, defaultName: requestedDefault }
}

const renderImport = (
  { from, isTypeOnly }: ModuleImport,
  missing: MissingBindings,
  style: CodeStyle,
): string => {
  const bindings = [
    missing.defaultName,
    missing.names.length === 0 ? undefined : `{ ${missing.names.join(', ')} }`,
  ]
    .filter((binding) => binding !== undefined)
    .join(', ')
  const keyword = isTypeOnly === true ? `${IMPORT_KEYWORD} ${TYPE_KEYWORD} ` : `${IMPORT_KEYWORD} `
  const specifier = `${style.quote}${from}${style.quote}`
  return `${keyword}${bindings === '' ? '' : `${bindings} from `}${specifier}${style.semicolon}`
}

/** The import the missing bindings can join: same kind, no namespace, no default for types. */
const findMergeTarget = (
  declarations: readonly ImportDeclaration[],
  isTypeOnly: boolean,
): ImportDeclaration | undefined =>
  declarations.find(
    (declaration) =>
      isTypeOnlyImport(declaration) === isTypeOnly &&
      declaration.specifiers.every(
        (specifier) =>
          specifier.type !== 'ImportNamespaceSpecifier' &&
          (!isTypeOnly || specifier.type !== 'ImportDefaultSpecifier'),
      ),
  )

/** Adds the missing bindings to an import that binds at least one name already. */
const mergeInto = (
  context: RawEditContext,
  declaration: ImportDeclaration,
  missing: MissingBindings,
): void => {
  const { code, text } = context
  const named = declaration.specifiers.filter(isNamed)
  const defaultSpecifier = declaration.specifiers.find(
    (specifier) => specifier.type === 'ImportDefaultSpecifier',
  )
  const [first] = named
  const last = named.at(-1)
  if (first !== undefined && last !== undefined) {
    const open = text.lastIndexOf(OPENING_BRACE, first.start)
    if (missing.names.length > 0) {
      const close = text.indexOf('}', last.end)
      appendToList(context, { open, close, items: named, emptyLayout: 'inline' }, missing.names)
    }
    if (missing.defaultName !== undefined) {
      code.prependRight(open, `${missing.defaultName}, `)
    }
    return
  }
  if (defaultSpecifier !== undefined && missing.names.length > 0) {
    code.appendLeft(defaultSpecifier.end, `, { ${missing.names.join(', ')} }`)
  }
}

/** Where a first import goes: before the first statement and the comments directly above it. */
const startOfFirstStatement = (context: RawEditContext, statement: Statement): number => {
  const { text, comments } = context
  let start = statement.start
  for (const comment of [...comments].reverse()) {
    const gap = text.slice(comment.end, start)
    const isOwnLine = text.slice(lineStartOf(text, comment.start), comment.start).trim() === ''
    if (comment.end > start || !isOwnLine || gap.trim() !== '' || gap.split('\n').length > 2) {
      continue
    }
    start = comment.start
  }
  return start
}

const isDirective = (statement: Statement): boolean =>
  statement.type === 'ExpressionStatement' && statement.directive != null

/** Places a new import among the imports, after the directives, or before the first statement. */
const insertImport = (context: RawEditContext, rendered: string, isBare: boolean): void => {
  const { code, text, program } = context
  const imports = importsOf(program)
  const anchor = isBare
    ? imports.at(-1)
    : imports.filter(({ specifiers }) => specifiers.length > 0).at(-1)
  if (anchor !== undefined) {
    code.appendLeft(lineEndOf(text, anchor.end), `\n${rendered}`)
    return
  }
  const [firstImport] = imports
  if (firstImport !== undefined) {
    code.prependRight(firstImport.start, `${rendered}\n`)
    return
  }
  const firstStatement = program.body.find((statement) => !isDirective(statement))
  if (firstStatement !== undefined) {
    code.prependRight(startOfFirstStatement(context, firstStatement), `${rendered}\n\n`)
    return
  }
  const lastDirective = program.body.at(-1)
  if (lastDirective !== undefined) {
    code.appendLeft(lineEndOf(text, lastDirective.end), `\n\n${rendered}`)
    return
  }
  code.append(`${rendered}\n`)
}

/** Turns `import type { … }` into `import { … }`; the names not `requested` stay types one by one. */
const promoteDeclaration = (
  context: RawEditContext,
  declaration: ImportDeclaration,
  requested: readonly ImportDeclarationSpecifier[],
): void => {
  const { code, text } = context
  const keyword = text.indexOf(TYPE_KEYWORD, declaration.start + IMPORT_KEYWORD.length)
  let end = keyword + TYPE_KEYWORD.length
  while (WHITESPACE.test(text[end] ?? '')) {
    end += 1
  }
  code.remove(keyword, end)
  for (const specifier of declaration.specifiers.filter(isNamed)) {
    if (!requested.includes(specifier)) {
      code.prependRight(specifier.start, `${TYPE_KEYWORD} `)
    }
  }
}

/** Whether a specifier binds one of the requested names under its own name. */
const isRequested = (
  specifier: ImportDeclarationSpecifier,
  names: ReadonlySet<string>,
  defaultName: string | undefined,
): boolean =>
  isNamed(specifier)
    ? names.has(specifier.local.name) && importedName(specifier) === specifier.local.name
    : specifier.local.name === defaultName

/**
 * Makes the requested names that are imported as types only into value imports: an inline
 * `type A` loses its `type`, an `import type` declaration becomes a value import.
 */
const promoteTypeBindings = (context: RawEditContext, moduleImport: ModuleImport): void => {
  if (moduleImport.isTypeOnly === true) {
    return
  }
  const names = new Set(moduleImport.names ?? [])
  const declarations = importsOf(context.program).filter(
    ({ source }) => source.value === moduleImport.from,
  )
  for (const declaration of declarations) {
    const requested = declaration.specifiers.filter((specifier) =>
      isRequested(specifier, names, moduleImport.defaultName),
    )
    if (isTypeOnlyImport(declaration) && requested.length > 0) {
      promoteDeclaration(context, declaration, requested)
      continue
    }
    for (const specifier of requested.filter(isNamed)) {
      if (specifier.importKind === 'type') {
        context.code.remove(specifier.start, specifier.imported.start)
      }
    }
  }
}

const addMissingBindings = (context: RawEditContext, moduleImport: ModuleImport): void => {
  const { code, text, program } = context
  const declarations = importsOf(program).filter(({ source }) => source.value === moduleImport.from)
  const missing = findMissing(declarations, moduleImport)
  const isBare = missing.names.length === 0 && missing.defaultName === undefined
  if (isBare && declarations.length > 0) {
    return
  }
  const rendered = renderImport(moduleImport, missing, detectCodeStyle(text, program))
  const target = findMergeTarget(declarations, moduleImport.isTypeOnly === true)
  if (target === undefined) {
    insertImport(context, rendered, isBare)
  } else if (target.specifiers.length === 0) {
    code.overwrite(target.start, target.end, rendered)
  } else {
    mergeInto(context, target, missing)
  }
}

/**
 * Adds an import, merging it into an import of the same module and kind; names imported already
 * are skipped, and a name imported as a type only becomes a value import. A new import goes after
 * the last import that binds a name, so bare imports such as a stylesheet stay last, and copies
 * the quotes and semicolons of the file.
 */
export const addModuleImport = (document: SourceDocument, moduleImport: ModuleImport): void => {
  document.edit((context) => promoteTypeBindings(context, moduleImport))
  document.edit((context) => addMissingBindings(context, moduleImport))
}
