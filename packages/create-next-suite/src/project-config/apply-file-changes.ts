import { lstat, mkdir, realpath, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import { isMissingFileError } from '../file-system/error-code.ts'
import { findUnsafePathProblem } from '../file-system/find-unsafe-path-problem.ts'
import { isInsideOrSame } from '../file-system/is-inside.ts'
import type { FileChange } from './plan-file-updates.ts'
import { ProjectConfigError } from './project-config-error.ts'

const isLink = async (path: string): Promise<boolean> => {
  try {
    return (await lstat(path)).isSymbolicLink()
  } catch (error) {
    if (isMissingFileError(error)) {
      return false
    }
    throw error
  }
}

/** The directory itself, or the nearest directory above it that exists. */
const nearestExisting = async (directory: string): Promise<string> => {
  try {
    await lstat(directory)
    return directory
  } catch (error) {
    if (isMissingFileError(error) && dirname(directory) !== directory) {
      return nearestExisting(dirname(directory))
    }
    throw error
  }
}

/** Fails for a file whose directory, or the part of it that exists, leads out of the project. */
const assertInsideProject = async (
  realProject: string,
  { path, directory }: { path: string; directory: string },
): Promise<void> => {
  if (!isInsideOrSame(realProject, await realpath(await nearestExisting(directory)))) {
    throw new ProjectConfigError(`${path} leads out of the project, such as through a link`)
  }
}

/**
 * Writes and removes files of a project as an update planned it. Every path is checked first: a
 * path that could leave the project, a file whose directory leads out of the project and a file
 * that is a link itself stop the update before anything is written.
 *
 * @throws ProjectConfigError for an unsafe path, a link on the way or a link at the path.
 */
export const applyFileChanges = async (
  projectDirectory: string,
  changes: readonly FileChange[],
): Promise<void> => {
  const realProject = await realpath(projectDirectory)
  for (const { path } of changes) {
    const problem = findUnsafePathProblem(path)
    if (problem !== undefined) {
      throw new ProjectConfigError(`the update would write ${path}, which ${problem}`)
    }
    const file = join(projectDirectory, path)
    await assertInsideProject(realProject, { path, directory: dirname(file) })
    if (await isLink(file)) {
      throw new ProjectConfigError(`${path} is a link; the update does not write through links`)
    }
  }
  for (const { path, content } of changes) {
    const file = join(projectDirectory, path)
    if (content === undefined) {
      await rm(file, { force: true })
      continue
    }
    await mkdir(dirname(file), { recursive: true })
    await assertInsideProject(realProject, { path, directory: dirname(file) })
    await writeFile(file, content)
  }
}
