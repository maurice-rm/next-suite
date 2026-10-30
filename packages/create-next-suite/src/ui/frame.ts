import ansis from 'ansis'

import { badge, failure, SYMBOLS } from './theme.ts'

/** The first line of the wizard, opening its frame. */
export const renderIntro = (title: string): string => `${ansis.gray(SYMBOLS.barStart)}  ${title}\n`

/** A badge that starts a section of the wizard, such as "Project". */
export const renderSectionBadge = (label: string): string =>
  `${ansis.gray(SYMBOLS.bar)}\n${ansis.gray(SYMBOLS.bar)}  ${badge(` ${label} `)}\n`

/** A line inside the frame between prompts, such as a line of the dry-run plan. */
export const renderFrameLine = (content: string): string =>
  content === '' ? ansis.gray(SYMBOLS.bar) : `${ansis.gray(SYMBOLS.bar)}  ${content}`

/** Every line of a text inside the frame, each with its line break. */
export const renderFramed = (text: string): string =>
  text
    .split('\n')
    .map((line) => `${renderFrameLine(line)}\n`)
    .join('')

/** The last line of the wizard, closing its frame. */
export const renderOutro = (message: string): string =>
  `${ansis.gray(SYMBOLS.barEnd)}  ${message}\n\n`

/** The last line of a cancelled or failed wizard. */
export const renderCancelled = (message: string): string => renderOutro(failure(message))
