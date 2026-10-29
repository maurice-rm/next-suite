import type { Writable } from 'node:stream'

import packageJson from '../../package.json' with { type: 'json' }
import { renderBanner } from '../ui/banner.ts'
import { failure, renderCancelled, renderFrameLine, renderIntro, renderOutro } from '../ui/theme.ts'

const INTRO = "Let's lay the foundation"
const CANCELLED = 'Operation cancelled.'
const DRY_RUN_DONE = 'Dry run, nothing was written'
const REPOSITORY_LINK = packageJson.repository.url
  .replace(/^git\+https:\/\//, '')
  .replace(/\.git$/, '')

/** How a run talks to the user: framed like the wizard, or as plain lines for scripts and CI. */
export type Presenter = {
  output: Writable
  error: Writable
  isFramed: boolean
}

/** Puts every line of a text into the frame of the wizard. */
export const frame = (text: string): string =>
  text
    .split('\n')
    .map((line) => `${renderFrameLine(line)}\n`)
    .join('')

/** Opens the wizard frame with the banner and the intro line. */
export const openFrame = (output: Writable, banner: { version: string; columns: number }): void => {
  output.write(renderBanner({ ...banner, link: REPOSITORY_LINK }))
  output.write(renderIntro(INTRO))
}

/** Shows the report of a dry run: what would be created, nothing written. */
export const presentDryRun = ({ output, isFramed }: Presenter, report: string): void => {
  output.write(isFramed ? frame(report) + renderOutro(DRY_RUN_DONE) : `${report}\n`)
}

/** Confirms the written project. */
export const presentCreated = ({ output, isFramed }: Presenter, directory: string): void => {
  const message = `Created ${directory}`
  output.write(isFramed ? renderOutro(message) : `${message}\n`)
}

/** Closes the frame of a run the user cancelled. */
export const presentCancelled = ({ output }: Presenter): void => {
  output.write(renderCancelled(CANCELLED))
}

/** Shows an expected failure, closing the frame when the wizard opened one. */
export const presentFailure = ({ error, isFramed }: Presenter, message: string): void => {
  error.write(isFramed ? renderCancelled(message) : `${failure(message)}\n`)
}
