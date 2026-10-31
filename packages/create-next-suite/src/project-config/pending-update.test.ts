import { existsSync } from 'node:fs'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  type PendingUpdate,
  readPendingUpdate,
  removePendingUpdate,
  writePendingUpdate,
} from './pending-update.ts'
import { ProjectConfigError } from './project-config-error.ts'
import { PROJECT_PATHS } from './project-paths.ts'

const PENDING: PendingUpdate = {
  generation: {
    '.next-suite/lock.json': '{}\n',
    '.next-suite/types.d.ts': 'export {}\n',
  },
  mergeConflicts: ['app/layout.tsx'],
  install: { command: 'pnpm', args: ['install'] },
}

let project: string

beforeEach(async () => {
  project = await mkdtemp(join(tmpdir(), 'next-suite-pending-'))
})

afterEach(async () => {
  await rm(project, { recursive: true, force: true })
})

describe('the pending update', () => {
  it('is written, read back and removed', async () => {
    await writePendingUpdate(project, PENDING)

    expect(await readPendingUpdate(project)).toEqual(PENDING)

    await removePendingUpdate(project)

    expect(await readPendingUpdate(project)).toBeUndefined()
    expect(existsSync(join(project, PROJECT_PATHS.pendingUpdate))).toBe(false)
  })

  it('fails for a file that is no pending update', async () => {
    await writePendingUpdate(project, PENDING)
    await writeFile(join(project, PROJECT_PATHS.pendingUpdate), '{"conflicts": 1}')

    await expect(readPendingUpdate(project)).rejects.toThrow(ProjectConfigError)
  })

  it('refuses a generation file outside .next-suite/', async () => {
    await writePendingUpdate(project, PENDING)
    await writeFile(
      join(project, PROJECT_PATHS.pendingUpdate),
      JSON.stringify({ ...PENDING, generation: { 'app/page.tsx': 'x' } }),
    )

    await expect(readPendingUpdate(project)).rejects.toThrow(/app\/page\.tsx/)
  })
})
