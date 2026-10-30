import ansis from 'ansis'

const BRAND_COLOR = '#2563EB'
const BADGE_TEXT_COLOR = '#ffffff'
const CHOSEN_COLOR = '#a3e635'
const IS_UNICODE = process.platform !== 'win32'

/** Box-drawing and status glyphs; Windows terminals get ASCII. */
export const SYMBOLS = {
  bar: IS_UNICODE ? '│' : '|',
  barStart: IS_UNICODE ? '┌' : 'T',
  barEnd: IS_UNICODE ? '└' : '-',
  corner: IS_UNICODE ? '↳' : '>',
  active: IS_UNICODE ? '◆' : '*',
  submit: IS_UNICODE ? '◇' : 'o',
  cancel: IS_UNICODE ? '■' : 'x',
  error: IS_UNICODE ? '▲' : '!',
  note: IS_UNICODE ? '●' : '-',
  radioOn: IS_UNICODE ? '●' : '>',
  radioOff: IS_UNICODE ? '○' : ' ',
  checkboxOn: IS_UNICODE ? '◼' : '[x]',
  checkboxOff: IS_UNICODE ? '◻' : '[ ]',
}

/** The frames of the spinner beside a running step. */
export const SPINNER_FRAMES = IS_UNICODE ? ['◒', '◐', '◓', '◑'] : ['-', '\\', '|', '/']

/** The brand colour: the active question and its bar. */
export const brand = ansis.hex(BRAND_COLOR)

/** The colour of the chosen option and of answered questions. */
export const chosen = ansis.hex(CHOSEN_COLOR)

/** The colour of a section badge: white on the brand colour. */
export const badge = ansis.bgHex(BRAND_COLOR).hex(BADGE_TEXT_COLOR).bold

/** The colour of errors and of a cancelled run. */
export const failure = ansis.red

/** The colour of a failed step and of an invalid answer. */
export const warning = ansis.yellow
