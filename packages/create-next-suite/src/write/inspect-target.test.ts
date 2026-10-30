import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { findTargetProblem, inspectTarget } from './inspect-target.ts'

let root: string

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'next-suite-target-'))
})

afterEach(async () => {
  await chmod(root, 0o700)
  await rm(root, { recursive: true, force: true })
})

describe('inspectTarget', () => {
  it('tells a missing path, an empty and a non-empty directory and a file apart', async () => {
    await mkdir(join(root, 'empty'))
    await mkdir(join(root, 'full'))
    await writeFile(join(root, 'full/notes.txt'), '')

    expect(inspectTarget(join(root, 'new'))).toBe('missing')
    expect(inspectTarget(join(root, 'empty'))).toBe('empty')
    expect(inspectTarget(join(root, 'full'))).toBe('not-empty')
    expect(inspectTarget(join(root, 'full/notes.txt'))).toBe('not-a-directory')
    expect(inspectTarget(join(root, 'full/notes.txt/app'))).toBe('not-a-directory')
  })

  it('counts a directory with only harmless entries such as .git and LICENSE as empty', async () => {
    await mkdir(join(root, 'repo/.git'), { recursive: true })
    await writeFile(join(root, 'repo/LICENSE'), '')
    await writeFile(join(root, 'repo/app.iml'), '')

    expect(inspectTarget(join(root, 'repo'))).toBe('empty')
  })
})

describe('findTargetProblem', () => {
  it('names a file at the path, but not a directory with files, which is a conflict', async () => {
    await mkdir(join(root, 'full'))
    await writeFile(join(root, 'full/notes.txt'), '')

    expect(findTargetProblem('new', join(root, 'new'))).toBeUndefined()
    expect(findTargetProblem('.', join(root, 'full'))).toBeUndefined()
    expect(findTargetProblem('notes.txt', join(root, 'full/notes.txt'))).toBe(
      'a file already exists at that path; choose another name',
    )
  })

  it.skipIf(process.getuid?.() === 0)('reports a directory that cannot be read', async () => {
    await mkdir(join(root, 'locked'))
    await chmod(join(root, 'locked'), 0o000)

    expect(findTargetProblem('locked', join(root, 'locked'))).toBe('"locked" cannot be read')
    await chmod(join(root, 'locked'), 0o700)
  })
})
