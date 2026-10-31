import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { ExpectedError } from '../expected-error.ts'
import { ProjectConfigError } from '../project-config/project-config-error.ts'
import { PROJECT_PATHS } from '../project-config/project-paths.ts'
import type { NextSuiteEnvironment, Report } from './next-suite-environment.ts'
import { runUpdate, UpdateMergeConflictError } from './update-command.ts'

/** A change of the project config and how the update after it runs. */
type ConfigChange = {
  root: string
  /** The new text of the config, from its current text. */
  edit: (text: string) => string
  /** What the change did, reported before the update. */
  summary: string
  force: boolean
}

/**
 * Changes `next-suite.config.ts`, then updates the project to it. When the update fails before it
 * changed a file, such as for a plugin the config cannot take or an untrusted source, the config
 * is restored; merge conflicts keep the change, since the files hold it already.
 *
 * @throws ProjectConfigError when the update fails, with the config restored.
 * @throws UpdateMergeConflictError when files have merge conflicts.
 */
export const changeConfigAndUpdate = async (
  environment: NextSuiteEnvironment,
  report: Report,
  { root, edit, summary, force }: ConfigChange,
): Promise<void> => {
  const path = join(root, PROJECT_PATHS.config)
  const original = await readFile(path, 'utf8')
  await writeFile(path, edit(original))
  report(summary)
  try {
    await runUpdate(environment, report, { dryRun: false, force })
  } catch (error) {
    if (error instanceof UpdateMergeConflictError) {
      throw error
    }
    await writeFile(path, original)
    if (error instanceof ExpectedError) {
      throw new ProjectConfigError(
        `${error.message}; ${PROJECT_PATHS.config} is restored as it was`,
        { cause: error.cause },
      )
    }
    throw error
  }
}
