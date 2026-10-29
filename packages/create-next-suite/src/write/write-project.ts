import { lstat, mkdir, realpath, rm, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, sep } from 'node:path'

import type { TargetAction } from '../answers/target-action.ts'
import type { ProjectPlan } from '../compose/compose-project.ts'
import { emptyTarget } from './empty-target.ts'
import { inspectTarget, isHarmlessEntry } from './inspect-target.ts'
import { WriteError } from './write-error.ts'

/** What this run created: every file it opened and the first folder of every new folder chain. */
type Created = { files: string[]; folders: string[] }

/** Where a project goes and what happens to files already there. */
export type WriteTarget = { directory: string; action: TargetAction; cwd: string }

const hasCode = (error: unknown, code: string): boolean =>
  error instanceof Error && 'code' in error && error.code === code

/** Answers whether the directory has to be created, and checks it fits the action. */
const prepareTarget = async ({ directory, action, cwd }: WriteTarget): Promise<boolean> => {
  const state = inspectTarget(directory)
  if (state === 'not-a-folder') {
    throw new WriteError(`${directory} exists and is not a directory`)
  }
  if (state === 'not-empty' && action === 'create') {
    throw new WriteError(`${directory} is not empty`)
  }
  if (state === 'not-empty' && action === 'empty') {
    await emptyTarget(directory, cwd)
  }
  return state === 'missing'
}

const createFolder = async (path: string, created: Created): Promise<void> => {
  const first = await mkdir(path, { recursive: true })
  if (first !== undefined) {
    created.folders.push(first)
  }
}

/** Whether a generated file may replace a file at its path: always with overwrite, otherwise only harmless ones. */
const mayReplace = (relativePath: string, action: TargetAction): boolean =>
  action === 'overwrite' || isHarmlessEntry(relativePath.split('/')[0] ?? '')

const writeOne = async (path: string, content: string, canReplace: boolean): Promise<boolean> => {
  const existing = await lstat(path).catch((error: unknown) => {
    if (hasCode(error, 'ENOENT')) {
      return undefined
    }
    throw error
  })
  if (existing === undefined) {
    await writeFile(path, content, { flag: 'wx' })
    return true
  }
  if (!canReplace || !existing.isFile()) {
    throw new WriteError(`${path} exists already and is not replaced`)
  }
  await writeFile(path, content)
  return false
}

/** Fails when a folder on the way to a file leads out of the target, such as through a link. */
const assertInsideTarget = async (realTarget: string, folder: string): Promise<void> => {
  const fromTarget = relative(realTarget, await realpath(folder))
  if (fromTarget === '..' || fromTarget.startsWith(`..${sep}`) || isAbsolute(fromTarget)) {
    throw new WriteError(`${folder} leads out of the project, such as through a link`)
  }
}

const writeFiles = async (
  plan: ProjectPlan,
  { directory, action }: WriteTarget,
  created: Created,
): Promise<void> => {
  const realTarget = await realpath(directory)
  for (const file of plan.files) {
    const path = join(directory, file.path)
    await createFolder(dirname(path), created)
    await assertInsideTarget(realTarget, dirname(path))
    if (await writeOne(path, file.content, mayReplace(file.path, action))) {
      created.files.push(path)
    }
  }
}

const removeCreated = async (created: Created): Promise<void> => {
  for (const path of [...created.files, ...created.folders.reverse()]) {
    await rm(path, { recursive: true, force: true })
  }
}

/**
 * Writes a composed project into its target. `create` needs a missing or empty folder, `empty`
 * deletes everything but `.git` first, `overwrite` writes over existing files. A file is never
 * written through a link or over a folder. If writing fails, every file and folder this run
 * created is removed again; files it replaced stay replaced.
 */
export const writeProject = async (plan: ProjectPlan, target: WriteTarget): Promise<void> => {
  const { directory } = target
  const isNew = await prepareTarget(target)
  const created: Created = { files: [], folders: [] }
  try {
    if (isNew) {
      await createFolder(directory, created)
    }
    await writeFiles(plan, target, created)
  } catch (error) {
    try {
      await removeCreated(created)
    } catch (cleanupError) {
      throw new WriteError(
        `writing ${directory} failed, and removing what was written failed too`,
        {
          cause: new AggregateError([error, cleanupError]),
        },
      )
    }
    throw new WriteError(`writing ${directory} failed; what this run created was removed`, {
      cause: error,
    })
  }
}
