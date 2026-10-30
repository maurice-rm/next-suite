import { rewriteModuleSpecifiers } from '../code-edit/rewrite-module-specifiers.ts'

const SOURCE_PREFIX = '@/'
const SOURCE_DIRECTORY = 'src/'
const ALIAS_WILDCARD = '*'
const SCRIPT_EXTENSION = /\.[cm]?[jt]sx?$/

/** Whether a path names a TypeScript or JavaScript module, which code edits can open. */
export const isScriptPath = (path: string): boolean => SCRIPT_EXTENSION.test(path)

/**
 * Where a project path is written to. `@/` stands for the source root: `@/lib/auth.ts` lands in
 * `src/lib/auth.ts` with a source directory, in `lib/auth.ts` without; any other path is relative
 * to the project root.
 */
export const toDiskPath = (path: string, isSrcDirectory: boolean): string => {
  if (!path.startsWith(SOURCE_PREFIX)) {
    return path
  }
  const relative = path.slice(SOURCE_PREFIX.length)
  return isSrcDirectory ? `${SOURCE_DIRECTORY}${relative}` : relative
}

/** The tsconfig target of the import alias: `./src/*` or `./*`. */
export const aliasTarget = (isSrcDirectory: boolean): string =>
  isSrcDirectory ? `./${SOURCE_DIRECTORY}${ALIAS_WILDCARD}` : `./${ALIAS_WILDCARD}`

/**
 * A script file's text with each import of `@/…` going through `alias` instead, such as `~/*`;
 * other files stay as they are.
 */
export const rewriteSourceAlias = (path: string, text: string, alias: string): string => {
  const prefix = alias.endsWith(ALIAS_WILDCARD) ? alias.slice(0, -ALIAS_WILDCARD.length) : alias
  if (prefix === SOURCE_PREFIX || !isScriptPath(path) || !text.includes(SOURCE_PREFIX)) {
    return text
  }
  return rewriteModuleSpecifiers(path, text, (specifier) =>
    specifier.startsWith(SOURCE_PREFIX)
      ? `${prefix}${specifier.slice(SOURCE_PREFIX.length)}`
      : specifier,
  )
}
