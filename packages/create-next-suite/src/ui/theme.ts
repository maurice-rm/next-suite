import type { State } from '@clack/core'
import ansis from 'ansis'

const BRAND_COLOR = '#2563EB'
const BADGE_TEXT_COLOR = '#ffffff'
const PICK_COLOR = '#a3e635'
const IS_UNICODE = process.platform !== 'win32'

/** Box-drawing and status glyphs; Windows terminals get ASCII. */
export const SYMBOLS = {
  bar: IS_UNICODE ? '│' : '|',
  barStart: IS_UNICODE ? '┌' : 'T',
  barEnd: IS_UNICODE ? '└' : '-',
  active: IS_UNICODE ? '◆' : '*',
  submit: IS_UNICODE ? '◇' : 'o',
  cancel: IS_UNICODE ? '■' : 'x',
  error: IS_UNICODE ? '▲' : '!',
  radioOn: IS_UNICODE ? '●' : '>',
  radioOff: IS_UNICODE ? '○' : ' ',
  checkboxOn: IS_UNICODE ? '◼' : '[x]',
  checkboxOff: IS_UNICODE ? '◻' : '[ ]',
}

/** The frames of the spinner beside a running step. */
export const SPINNER_FRAMES = IS_UNICODE ? ['◒', '◐', '◓', '◑'] : ['-', '\\', '|', '/']

/** The brand colour: the active question and its bar. */
export const brand = ansis.hex(BRAND_COLOR)

/** The pick colour: the chosen option and answered questions. */
export const pick = ansis.hex(PICK_COLOR)

const stateGlyph = (state: State): string => {
  switch (state) {
    case 'submit':
      return pick(SYMBOLS.submit)
    case 'cancel':
      return ansis.red(SYMBOLS.cancel)
    case 'error':
      return ansis.yellow(SYMBOLS.error)
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
  keys: [key: string, label: string][],
  back: { key: string; isPossible: boolean },
) => {
  const entries: [string, string][] = [
    ...keys,
    ...(back.isPossible ? [[back.key, 'back'] as [string, string]] : []),
    ['ctrl+c', 'cancel'],
  ]
  return ansis.dim(entries.map(([key, label]) => `${ansis.gray(key)} ${label}`).join(' • '))
}

/** A line inside the active prompt, after its bar. */
export const renderLine = (content: string): string => `${brand(SYMBOLS.bar)}  ${content}`

/** The end of the active prompt with its footer. */
export const renderEnd = (footer: string): string => `${brand(SYMBOLS.barEnd)}\n   ${footer}\n`

/** An error message in the colour of failures. */
export const failure = ansis.red

/** The first line of the wizard, opening its frame. */
export const renderIntro = (title: string): string => `${ansis.gray(SYMBOLS.barStart)}  ${title}\n`

/** A badge that starts a section of the wizard, such as "Project". */
export const renderSectionBadge = (label: string): string =>
  `${ansis.gray(SYMBOLS.bar)}\n${ansis.gray(SYMBOLS.bar)}  ${ansis.bgHex(BRAND_COLOR).hex(BADGE_TEXT_COLOR).bold(` ${label} `)}\n`

/** A line inside the frame between prompts, such as a line of the dry-run plan. */
export const renderFrameLine = (content: string): string =>
  content === '' ? ansis.gray(SYMBOLS.bar) : `${ansis.gray(SYMBOLS.bar)}  ${content}`

/** A running step beside the current frame of the spinner, without a line break. */
export const renderStepRunning = (spinnerFrame: string, message: string): string =>
  `${brand(spinnerFrame)}  ${message}…`

/** A finished step: done, or failed or skipped with the reason. */
export const renderStepResult = (isSuccess: boolean, message: string): string =>
  isSuccess ? `${pick(SYMBOLS.submit)}  ${message}` : `${ansis.yellow(SYMBOLS.error)}  ${message}`

/** Output of a command inside the frame, dimmed below the step it belongs to. */
export const renderCommandOutput = (content: string): string =>
  `${ansis.gray(SYMBOLS.bar)}  ${ansis.dim(content)}`

/** The last line of the wizard, closing its frame. */
export const renderOutro = (message: string): string =>
  `${ansis.gray(SYMBOLS.barEnd)}  ${message}\n\n`

/** The last line of a cancelled wizard. */
export const renderCancelled = (message: string): string =>
  `${ansis.gray(SYMBOLS.barEnd)}  ${ansis.red(message)}\n\n`
