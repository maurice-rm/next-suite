import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { ProjectPlan } from '../compose/compose-project.ts'
import { writeProject } from './write-project.ts'

const planOf = (files: Record<string, string>): ProjectPlan => ({
  files: Object.entries(files).map(([path, content]) => ({ path, content, origin: 'base' })),
  dependencies: {},
  devDependencies: {},
})

const BROKEN_PLAN = planOf({
  'a.txt': 'one',
  'src/lib/db.ts': 'two',
  'src/lib/db.ts/inner.ts': 'three',
})

let root: string

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'next-suite-write-'))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('writeProject', () => {
  it('creates the directory and every file of the plan', async () => {
    await writeProject(
      planOf({ 'package.json': '{}\n', 'app/page.tsx': 'page' }),
      join(root, 'my-app'),
    )

    expect(await readFile(join(root, 'my-app/app/page.tsx'), 'utf8')).toBe('page')
    expect(await readFile(join(root, 'my-app/package.json'), 'utf8')).toBe('{}\n')
  })

  it('writes into an existing empty directory', async () => {
    await mkdir(join(root, 'empty'))

    await writeProject(planOf({ 'a.txt': 'a' }), join(root, 'empty'))

    expect(await readdir(join(root, 'empty'))).toEqual(['a.txt'])
  })

  it('refuses a directory that is not empty and leaves it untouched', async () => {
    await mkdir(join(root, 'used'))
    await writeFile(join(root, 'used/keep.txt'), 'mine')

    await expect(writeProject(planOf({ 'a.txt': 'a' }), join(root, 'used'))).rejects.toThrow(
      'is not empty',
    )
    expect(await readdir(join(root, 'used'))).toEqual(['keep.txt'])
  })

  it('refuses a path that is a file', async () => {
    await writeFile(join(root, 'file'), '')

    await expect(writeProject(planOf({ 'a.txt': 'a' }), join(root, 'file'))).rejects.toThrow(
      'is not a directory',
    )
  })

  it('removes the directory it created when writing fails', async () => {
    await expect(writeProject(BROKEN_PLAN, join(root, 'my-app'))).rejects.toThrow(
      'nothing was left behind',
    )
    expect(await readdir(root)).toEqual([])
  })

  it('removes the files it wrote from an existing directory when writing fails', async () => {
    await mkdir(join(root, 'empty'))

    await expect(writeProject(BROKEN_PLAN, join(root, 'empty'))).rejects.toThrow(
      'nothing was left behind',
    )
    expect(await readdir(join(root, 'empty'), { recursive: true })).toEqual([])
  })
})
