import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { writeFiles } from '../test-support/write-files.ts'
import { applyFileChanges } from './apply-file-changes.ts'
import { ProjectConfigError } from './project-config-error.ts'

let workspace: string
let project: string

beforeEach(async () => {
  workspace = await mkdtemp(join(tmpdir(), 'next-suite-apply-'))
  project = join(workspace, 'project')
  await mkdir(project)
})

afterEach(async () => {
  await rm(workspace, { recursive: true, force: true })
})

describe('applyFileChanges', () => {
  it('writes and removes files, creating directories on the way', async () => {
    await writeFiles(project, { 'lib/gone.ts': 'gone\n' })

    await applyFileChanges(project, [
      { path: 'lib/new/logger.ts', content: 'logger\n' },
      { path: 'lib/gone.ts', content: undefined },
    ])

    expect(await readFile(join(project, 'lib/new/logger.ts'), 'utf8')).toBe('logger\n')
    expect(existsSync(join(project, 'lib/gone.ts'))).toBe(false)
  })

  it('refuses a directory that leads out of the project through a link', async () => {
    await mkdir(join(workspace, 'outside'))
    await symlink(join(workspace, 'outside'), join(project, 'lib'))

    await expect(
      applyFileChanges(project, [{ path: 'lib/logger.ts', content: 'logger\n' }]),
    ).rejects.toThrow(ProjectConfigError)
    expect(existsSync(join(workspace, 'outside', 'logger.ts'))).toBe(false)
  })

  it('refuses an unsafe path', async () => {
    await expect(
      applyFileChanges(project, [{ path: '../escape.ts', content: 'x\n' }]),
    ).rejects.toThrow(/\.\.\/escape\.ts/)
  })
})
