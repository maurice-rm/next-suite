import { resolve } from 'node:path'

import type { NextStep } from '../compose/run-summary.ts'
import type { SuggestedCommand } from '../ui/outro.ts'

const WHITESPACE = /\s/

type NextStepsInput = {
  directory: string
  cwd: string
  packageManager: string
  isInstalled: boolean
  nextSteps: readonly NextStep[]
}

const quoted = (path: string): string => (WHITESPACE.test(path) ? `"${path}"` : path)

/**
 * The commands the end of a run suggests, in order: change into the project, the plain commands
 * of the plugins (such as starting a database), the install when it did not run, then the scripts
 * of the plugins with the package manager.
 */
export const listNextSteps = ({
  directory,
  cwd,
  packageManager,
  isInstalled,
  nextSteps,
}: NextStepsInput): SuggestedCommand[] => {
  const withManager = (command: string): SuggestedCommand => ({ command, packageManager })
  const plain = (command: string): SuggestedCommand => ({ command, packageManager: undefined })
  return [
    ...(resolve(cwd, directory) === resolve(cwd) ? [] : [plain(`cd ${quoted(directory)}`)]),
    ...nextSteps.flatMap((step) => ('command' in step ? [plain(step.command)] : [])),
    ...(isInstalled ? [] : [withManager(`${packageManager} install`)]),
    ...nextSteps.flatMap((step) =>
      'script' in step ? [withManager(`${packageManager} run ${step.script}`)] : [],
    ),
  ]
}
