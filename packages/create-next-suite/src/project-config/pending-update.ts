import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import * as z from 'zod'

import { isMissingFileError } from '../file-system/error-code.ts'
import { findUnsafePathProblem } from '../file-system/find-unsafe-path-problem.ts'
import { parseJsonWith } from '../file-system/read-json-file.ts'
import { formatJson } from '../project-model/format-json.ts'
import { ProjectConfigError } from './project-config-error.ts'
import { PROJECT_PATHS } from './project-paths.ts'

/** The files of a generation the update writes once its merge conflicts are resolved. */
const GENERATION_FILES: readonly string[] = [PROJECT_PATHS.lock, PROJECT_PATHS.registryTypes]
/** The package managers an update may run the install with. */
const PACKAGE_MANAGERS = ['npm', 'pnpm', 'yarn', 'bun'] as const
/** An argument of an install, such as `install` or `--no-immutable`; nothing a shell would read. */
const INSTALL_ARGUMENT = /^-{0,2}[\w][\w.=-]*$/

/** Whether a package manager is one an update may run the install with. */
export const isInstallCommand = (command: string): command is (typeof PACKAGE_MANAGERS)[number] =>
  PACKAGE_MANAGERS.some((manager) => manager === command)

const projectPath = z.string().refine((path) => findUnsafePathProblem(path) === undefined, {
  message: 'is no safe path in the project',
})

const pendingUpdateSchema = z.strictObject({
  generation: z.record(
    z.string().refine((path) => GENERATION_FILES.includes(path), {
      message: `names a file other than ${GENERATION_FILES.join(' and ')}`,
    }),
    z.string(),
  ),
  mergeConflicts: z.array(projectPath),
  install: z
    .strictObject({
      command: z.enum(PACKAGE_MANAGERS),
      args: z.array(z.string().regex(INSTALL_ARGUMENT)),
    })
    .nullable(),
})

/**
 * An update that left merge conflicts: the lock and registry types it writes once they are resolved,
 * the files with merge conflict markers, and the install to run then, if the dependencies changed.
 */
export type PendingUpdate = z.output<typeof pendingUpdateSchema>

const pathIn = (projectDirectory: string): string =>
  join(projectDirectory, PROJECT_PATHS.pendingUpdate)

/** Records an update that waits for its merge conflicts to be resolved. */
export const writePendingUpdate = async (
  projectDirectory: string,
  pending: PendingUpdate,
): Promise<void> => {
  const path = pathIn(projectDirectory)
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, formatJson({ ...pending, generation: { ...pending.generation } }))
}

/**
 * The update that waits for its merge conflicts to be resolved, or nothing.
 *
 * @throws ProjectConfigError for a file that is no pending update.
 */
export const readPendingUpdate = async (
  projectDirectory: string,
): Promise<PendingUpdate | undefined> => {
  const path = pathIn(projectDirectory)
  let text: string
  try {
    text = await readFile(path, 'utf8')
  } catch (error) {
    if (isMissingFileError(error)) {
      return undefined
    }
    throw error
  }
  return parseJsonWith(
    text,
    pendingUpdateSchema,
    (problem, options) => new ProjectConfigError(`${path} ${problem}`, options),
  )
}

/** Removes the record of a pending update, if there is one. */
export const removePendingUpdate = async (projectDirectory: string): Promise<void> => {
  await rm(pathIn(projectDirectory), { force: true })
}
