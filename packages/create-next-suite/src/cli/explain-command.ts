import { stat } from 'node:fs/promises'
import { isAbsolute, relative, resolve, sep } from 'node:path'

import type { Command } from 'commander'

import { isMissingFileError } from '../file-system/error-code.ts'
import { readTextIfPresent } from '../file-system/read-text-if-present.ts'
import { InputError } from '../input-error.ts'
import { explainFile } from '../project-config/explain-file.ts'
import { findProjectRoot } from '../project-config/find-project-root.ts'
import { readLockFile } from '../project-config/read-lock-file.ts'
import type { NextSuiteEnvironment, Report } from './next-suite-environment.ts'

const PARENT = '..'

const isDirectory = async (path: string): Promise<boolean> => {
  try {
    return (await stat(path)).isDirectory()
  } catch (error) {
    if (isMissingFileError(error)) {
      return false
    }
    throw error
  }
}

/**
 * Explains a file of the project the current directory lies in: who wrote it, whether it is still
 * as generated, and what each plugin did to it.
 *
 * @throws ProjectConfigError outside a project, or for a lock that is missing or no lock.
 * @throws InputError for a file outside the project or a directory.
 */
const explain = async ({ cwd }: NextSuiteEnvironment, file: string): Promise<string> => {
  const root = findProjectRoot(cwd)
  const absolute = resolve(cwd, file)
  const path = relative(root, absolute).split(sep).join('/')
  if (path === '' || path === PARENT || path.startsWith(`${PARENT}/`) || isAbsolute(path)) {
    throw new InputError(`${file} lies outside the project ${root}`)
  }
  if (await isDirectory(absolute)) {
    throw new InputError(`${file} is a directory; explain takes a file`)
  }
  const lock = await readLockFile(root)
  return explainFile({ lock, path, content: await readTextIfPresent(absolute) }).join('\n')
}

export const addExplainCommand = (
  program: Command,
  environment: NextSuiteEnvironment,
  report: Report,
): void => {
  program
    .command('explain <file>')
    .description('show who wrote a file of the project and what each plugin did to it')
    .action(async (file: string) => report(await explain(environment, file)))
}
