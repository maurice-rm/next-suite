import { mkdir, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import type { ProjectPlan } from '../compose/compose-project.ts'
import { inspectTarget } from './inspect-target.ts'
import { WriteError } from './write-error.ts'

/** What this run created: every file it opened and the first folder of every new folder chain. */
type Created = { files: string[]; folders: string[] }

const hasCode = (error: unknown, code: string): boolean =>
  error instanceof Error && 'code' in error && error.code === code

/** Answers whether the directory has to be created; an existing one must be an empty directory. */
const needsCreation = (directory: string): boolean => {
  switch (inspectTarget(directory)) {
    case 'missing':
      return true
    case 'empty':
      return false
    case 'not-a-folder':
      throw new WriteError(`${directory} exists and is not a directory`)
    case 'not-empty':
      throw new WriteError(`${directory} is not empty`)
  }
}

const createFolder = async (path: string, created: Created): Promise<void> => {
  const first = await mkdir(path, { recursive: true })
  if (first !== undefined) {
    created.folders.push(first)
  }
}

const writeFiles = async (
  plan: ProjectPlan,
  directory: string,
  created: Created,
): Promise<void> => {
  for (const file of plan.files) {
    const path = join(directory, file.path)
    await createFolder(dirname(path), created)
    created.files.push(path)
    await writeFile(path, file.content, { flag: 'wx' }).catch((error: unknown) => {
      if (hasCode(error, 'EEXIST')) {
        created.files.pop()
      }
      throw error
    })
  }
}

const removeCreated = async (created: Created): Promise<void> => {
  for (const path of [...created.files, ...created.folders.reverse()]) {
    await rm(path, { recursive: true, force: true })
  }
}

/**
 * Writes a composed project into a new or empty directory. Files are created exclusively, so
 * nothing existing is overwritten or followed; if writing fails, every file and folder this run
 * created is removed again, including the directory when this run created it.
 */
export const writeProject = async (plan: ProjectPlan, directory: string): Promise<void> => {
  const isNew = needsCreation(directory)
  const created: Created = { files: [], folders: [] }
  try {
    if (isNew) {
      await createFolder(directory, created)
    }
    await writeFiles(plan, directory, created)
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
    throw new WriteError(`writing ${directory} failed; nothing was left behind`, { cause: error })
  }
}
