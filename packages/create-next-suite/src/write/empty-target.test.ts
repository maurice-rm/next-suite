import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join, parse } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { findEmptyingProblem } from './empty-target.ts'

let root: string

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'next-suite-empty-'))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('findEmptyingProblem', () => {
  it('allows a folder inside the current directory', async () => {
    await mkdir(join(root, 'shop'))

    expect(findEmptyingProblem(join(root, 'shop'), root)).toBeUndefined()
  })

  it('refuses a root, the home folder, the current directory and its parents', () => {
    const cwd = join(root, 'work')

    expect(findEmptyingProblem(parse(root).root, cwd)).toMatch(/^refusing to empty/)
    expect(findEmptyingProblem(homedir(), cwd)).toMatch(/^refusing to empty/)
    expect(findEmptyingProblem(cwd, cwd)).toMatch(/^refusing to empty/)
    expect(findEmptyingProblem(root, cwd)).toMatch(/^refusing to empty/)
  })

  it('refuses a path that leads to the current directory through a link', async () => {
    const cwd = join(root, 'work')
    await mkdir(cwd)
    await symlink(root, join(cwd, 'up'))

    expect(findEmptyingProblem(join(cwd, 'up', 'work'), cwd)).toMatch(/^refusing to empty/)
  })

  it('fails on a path it cannot resolve for another reason than a missing entry', async () => {
    await writeFile(join(root, 'notes.txt'), '')

    expect(() => findEmptyingProblem(join(root, 'notes.txt', 'shop'), root)).toThrow('ENOTDIR')
  })
})
