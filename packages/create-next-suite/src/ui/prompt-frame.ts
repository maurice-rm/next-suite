import type { State } from '@clack/core'
import ansis from 'ansis'

import { brand, chosen, failure, SYMBOLS, warning } from './theme.ts'

/** A key a prompt takes and what it does, such as `enter` and `confirm`. */
export type PromptKey = [key: string, label: string]

const stateGlyph = (state: State): string => {
  switch (state) {
    case 'submit':
      return chosen(SYMBOLS.submit)
    case 'cancel':
      return failure(SYMBOLS.cancel)
    case 'error':
      return warning(SYMBOLS.error)
    default:
      return brand(SYMBOLS.active)
  }
}

/** The bar and glyph above every prompt, with its message. */
export const renderPromptTitle = (state: State, message: string): string =>
  `${ansis.gray(SYMBOLS.bar)}\n${stateGlyph(state)}  ${message}\n`

/** An answered prompt: its answer dimmed, struck through when the user went back from it. */
export const renderResolved = (state: State, message: string, answer: string): string => {
  const title = renderPromptTitle(state, message)
  const bar = ansis.gray(SYMBOLS.bar)
  return state === 'cancel'
    ? `${title}${bar}  ${ansis.strikethrough(ansis.dim(answer))}\n${bar}`
    : `${title}${bar}  ${ansis.dim(answer)}`
}

/** The keys a prompt takes, shown under it; the back key only where going back is possible. */
export const renderFooter = (
  keys: readonly PromptKey[],
  back: { key: string; isPossible: boolean },
): string => {
  const entries: PromptKey[] = [
    ...keys,
    ...(back.isPossible ? [[back.key, 'back'] satisfies PromptKey] : []),
    ['ctrl+c', 'cancel'],
  ]
  return ansis.dim(entries.map(([key, label]) => `${ansis.gray(key)} ${label}`).join(' • '))
}

/** A line inside the active prompt, after its bar. */
export const renderLine = (content: string): string => `${brand(SYMBOLS.bar)}  ${content}`

/** The end of the active prompt with its footer. */
export const renderEnd = (footer: string): string => `${brand(SYMBOLS.barEnd)}\n   ${footer}\n`
