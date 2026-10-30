import type { Writable } from 'node:stream'

import packageJson from '../../package.json' with { type: 'json' }
import { renderBanner } from '../ui/banner.ts'
import { renderCancelled, renderFramed, renderIntro, renderOutro } from '../ui/frame.ts'
import { type Outro, renderOutroSummary, renderPlainSummary } from '../ui/outro.ts'
import { failure } from '../ui/theme.ts'

const INTRO = "Let's lay the foundation"
const CANCELLED = 'Operation cancelled.'
const DRY_RUN_DONE = 'Dry run, nothing was written'
const NOTHING_GENERATED = 'Nothing generated yet: the base project is still missing'
const REPOSITORY_LINK = packageJson.repository.url
  .replace(/^git\+https:\/\//, '')
  .replace(/\.git$/, '')

/** How a run talks to the user: framed like the wizard, or as plain lines for scripts and CI. */
export type Presenter = {
  output: Writable
  error: Writable
  isFramed: boolean
}

/** Opens the wizard frame with the banner and the intro line. */
export const openFrame = (
  output: Writable,
  banner: { version: string; latest: string | undefined; columns: number },
): void => {
  output.write(renderBanner({ ...banner, repositoryLink: REPOSITORY_LINK }))
  output.write(renderIntro(INTRO))
}

export const presentDryRun = ({ output, isFramed }: Presenter, report: string): void => {
  output.write(isFramed ? renderFramed(report) + renderOutro(DRY_RUN_DONE) : `${report}\n`)
}

/** Ends a run that asked its questions but has no base project to generate from. */
export const presentNothingGenerated = ({ output, isFramed }: Presenter): void => {
  output.write(isFramed ? renderOutro(NOTHING_GENERATED) : `${NOTHING_GENERATED}\n`)
}

/** Confirms the written project with its stack and the commands to run next. */
export const presentCreated = (
  { output, isFramed }: Presenter,
  summary: Omit<Outro, 'repositoryLink'>,
): void => {
  const outro = { ...summary, repositoryLink: REPOSITORY_LINK }
  output.write(isFramed ? renderOutroSummary(outro) : renderPlainSummary(outro))
}

export const presentCancelled = ({ output }: Presenter): void => {
  output.write(renderCancelled(CANCELLED))
}

/** Shows a failure, closing the frame when the wizard opened one. */
export const presentFailure = ({ error, isFramed }: Presenter, message: string): void => {
  error.write(isFramed ? renderCancelled(message) : `${failure(message)}\n`)
}
