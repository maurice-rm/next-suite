import { lstat, mkdir, realpath, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import type { TargetAction } from '../answers/target-action.ts'
import type { ProjectPlan } from '../compose/compose-project.ts'
import { isMissingFileError } from '../file-system/error-code.ts'
import { isInsideOrSame } from '../file-system/is-inside.ts'
import { emptyTarget } from './empty-target.ts'
import { inspectTarget, isHarmlessEntry, type TargetState } from './inspect-target.ts'
import { WriteError } from './write-error.ts'

/** What this run created: every file it opened and the first directory of every new chain. */
type CreatedPaths = { files: string[]; directories: string[] }

/** Where a project goes and what happens to files already there. */
export type WriteTarget = { directory: string; action: TargetAction; cwd: string }

/** Fails when what is at the target does not fit the action. */
const assertTargetFits = (state: TargetState, { directory, action }: WriteTarget): void => {
  if (state === 'not-a-directory') {
    throw new WriteError(`${directory} exists and is not a directory`)
  }
  if (state === 'not-empty' && action === 'create') {
    throw new WriteError(`${directory} is not empty`)
  }
}

const createDirectory = async (path: string, created: CreatedPaths): Promise<void> => {
  const first = await mkdir(path, { recursive: true })
  if (first !== undefined) {
    created.directories.push(first)
  }
}

/**
 * Whether a generated file may replace a file at its path: always with overwrite, otherwise only a
 * harmless entry at the top of the target, never a file inside a harmless directory.
 */
const mayReplace = (relativePath: string, action: TargetAction): boolean =>
  action === 'overwrite' || (!relativePath.includes('/') && isHarmlessEntry(relativePath))

const existingEntry = (path: string) =>
  lstat(path).catch((error: unknown) => {
    if (isMissingFileError(error)) {
      return undefined
    }
    throw error
  })

type ProjectFile = { path: string; content: string; canReplace: boolean }

/** Writes one file, recording it as created when nothing was at its path. */
const writeProjectFile = async (
  { path, content, canReplace }: ProjectFile,
  created: CreatedPaths,
): Promise<void> => {
  const existing = await existingEntry(path)
  if (existing === undefined) {
    await writeFile(path, content, { flag: 'wx' })
    created.files.push(path)
    return
  }
  if (!canReplace || !existing.isFile()) {
    throw new WriteError(`${path} exists already and is not replaced`)
  }
  await writeFile(path, content)
}

/** Fails when a directory on the way to a file leads out of the target, such as through a link. */
const assertInsideTarget = async (realTarget: string, directory: string): Promise<void> => {
  if (!isInsideOrSame(realTarget, await realpath(directory))) {
    throw new WriteError(`${directory} leads out of the project, such as through a link`)
  }
}

const writeFiles = async (
  plan: ProjectPlan,
  { directory, action }: WriteTarget,
  created: CreatedPaths,
): Promise<void> => {
  const realTarget = await realpath(directory)
  for (const file of plan.files) {
    const path = join(directory, file.path)
    await createDirectory(dirname(path), created)
    await assertInsideTarget(realTarget, dirname(path))
    await writeProjectFile(
      { path, content: file.content, canReplace: mayReplace(file.path, action) },
      created,
    )
  }
}

const removeCreated = async (created: CreatedPaths): Promise<void> => {
  for (const path of [...created.files, ...created.directories.toReversed()]) {
    await rm(path, { recursive: true, force: true })
  }
}

/**
 * Writes a composed project into its target. `create` needs a missing or empty directory, `empty`
 * deletes everything but `.git` first, `overwrite` writes over existing files. A file is never
 * written through a link or over a directory. If writing fails, every file and directory this run
 * created is removed again; files it replaced stay replaced.
 */
export const writeProject = async (plan: ProjectPlan, target: WriteTarget): Promise<void> => {
  const { directory, action, cwd } = target
  const state = inspectTarget(directory)
  assertTargetFits(state, target)
  if (state === 'not-empty' && action === 'empty') {
    await emptyTarget(directory, cwd)
  }
  const created: CreatedPaths = { files: [], directories: [] }
  try {
    if (state === 'missing') {
      await createDirectory(directory, created)
    }
    await writeFiles(plan, target, created)
  } catch (error) {
    try {
      await removeCreated(created)
    } catch (cleanupError) {
      throw new WriteError(
        `writing ${directory} failed, and removing what was written failed too`,
        { cause: new AggregateError([error, cleanupError]) },
      )
    }
    throw new WriteError(`writing ${directory} failed; what this run created was removed`, {
      cause: error,
    })
  }
}
