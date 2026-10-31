import { existsSync } from 'node:fs'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { initRepository } from '../test-support/git.ts'
import { writeFiles } from '../test-support/write-files.ts'
import {
  type PendingUpdate,
  pendingUpdatePathOf,
  readPendingUpdate,
  removePendingUpdate,
  writePendingUpdate,
} from './pending-update.ts'
import { ProjectConfigError } from './project-config-error.ts'

const PENDING: PendingUpdate = {
  generation: {
    '.next-suite/lock.json': '{}\n',
    '.next-suite/types.d.ts': 'export {}\n',
  },
  mergeConflicts: ['app/layout.tsx'],
  install: { command: 'pnpm', args: ['install'] },
}

let repository: string
let project: string

beforeEach(async () => {
  repository = await mkdtemp(join(tmpdir(), 'next-suite-pending-'))
  project = join(repository, 'apps', 'web')
  initRepository(repository)
  await writeFiles(project, { 'package.json': '{}\n' })
})

afterEach(async () => {
  await rm(repository, { recursive: true, force: true })
})

describe('the pending update', () => {
  it('is written into the Git directory, read back and removed', async () => {
    await writePendingUpdate(project, PENDING)
    const path = await pendingUpdatePathOf(project)

    expect(path.startsWith(join(repository, '.git'))).toBe(true)
    expect(await readPendingUpdate(project)).toEqual(PENDING)

    await removePendingUpdate(project)

    expect(await readPendingUpdate(project)).toBeUndefined()
    expect(existsSync(path)).toBe(false)
  })

  it('is not read from the working tree, where a repository could bring one along', async () => {
    await writeFiles(project, {
      '.next-suite/pending-update.json': JSON.stringify(PENDING),
    })

    expect(await readPendingUpdate(project)).toBeUndefined()
  })

  it('fails for a file that is no pending update', async () => {
    await writePendingUpdate(project, PENDING)
    await writeFile(await pendingUpdatePathOf(project), '{"mergeConflicts": 1}')

    await expect(readPendingUpdate(project)).rejects.toThrow(ProjectConfigError)
  })

  it('refuses a generation file outside .next-suite/ and an install that is no install', async () => {
    const path = await pendingUpdatePathOf(project)
    await writePendingUpdate(project, PENDING)
    await writeFile(path, JSON.stringify({ ...PENDING, generation: { 'app/page.tsx': 'x' } }))
    await expect(readPendingUpdate(project)).rejects.toThrow(/app\/page\.tsx/)

    await writeFile(
      path,
      JSON.stringify({
        ...PENDING,
        install: { command: 'npm', args: ['exec', '--yes', 'evil'] },
      }),
    )
    await expect(readPendingUpdate(project)).rejects.toThrow(ProjectConfigError)
  })
})
