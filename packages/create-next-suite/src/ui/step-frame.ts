import ansis from 'ansis'

import { brand, chosen, SYMBOLS, warning } from './theme.ts'

/** A running step beside the current frame of the spinner, without a line break. */
export const renderStepRunning = (spinnerFrame: string, message: string): string =>
  `${brand(spinnerFrame)}  ${message}…`

/** A step that succeeded. */
export const renderStepDone = (message: string): string => `${chosen(SYMBOLS.submit)}  ${message}`

/** A step that failed, with what to do instead. */
export const renderStepFailed = (message: string): string => `${warning(SYMBOLS.error)}  ${message}`

/** A note between the steps, such as a step that was skipped and why. */
export const renderStepNote = (message: string): string => `${ansis.gray(SYMBOLS.note)}  ${message}`

/** Output of a command inside the frame, dimmed below the step it belongs to. */
export const renderCommandOutput = (content: string): string =>
  `${ansis.gray(SYMBOLS.bar)}  ${ansis.dim(content)}`
