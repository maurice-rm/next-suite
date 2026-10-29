import { resolve } from 'node:path'

import type { NextStep } from '../compose/compose-project.ts'

const WHITESPACE = /\s/
const FALLBACK_PACKAGE_MANAGER = 'npm'

type NextStepsInput = {
  directory: string
  cwd: string
  packageManager: string | undefined
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
}: NextStepsInput): { command: string; packageManager: string | undefined }[] => {
  const manager = packageManager ?? FALLBACK_PACKAGE_MANAGER
  const withManager = (command: string) => ({ command, packageManager: manager })
  const plain = (command: string) => ({ command, packageManager: undefined })
  return [
    ...(resolve(cwd, directory) === resolve(cwd) ? [] : [plain(`cd ${quoted(directory)}`)]),
    ...nextSteps.flatMap((step) => ('command' in step ? [plain(step.command)] : [])),
    ...(isInstalled ? [] : [withManager(`${manager} install`)]),
    ...nextSteps.flatMap((step) =>
      'script' in step ? [withManager(`${manager} run ${step.script}`)] : [],
    ),
  ]
}
