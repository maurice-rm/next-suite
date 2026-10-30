import { type CodeStyle, renderString } from './code-style.ts'

const IDENTIFIER = /^[A-Za-z_$][\w$]*$/

/** The key as written in code: `level`, or `"script-src"` when it is no identifier. */
export const renderPropertyName = (key: string, style: CodeStyle): string =>
  IDENTIFIER.test(key) ? key : renderString(key, style)
