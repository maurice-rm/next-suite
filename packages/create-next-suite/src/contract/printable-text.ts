import * as z from 'zod'

/**
 * Control and format characters, such as escape sequences or bidi overrides: in text a terminal
 * shows, it would run them, and they could hide what a trust question says.
 */
const UNPRINTABLE_CLASS = '\\p{Cc}\\p{Cf}'

/** Finds a control or format character in a text. */
export const CONTROL_CHARACTER = new RegExp(`[${UNPRINTABLE_CLASS}]`, 'u')

/** A text a terminal shows as it is: not empty, without control or format characters. */
export const printableText = z
  .string()
  .min(1)
  .regex(new RegExp(`^[^${UNPRINTABLE_CLASS}]*$`, 'u'), 'Remove control and format characters')
