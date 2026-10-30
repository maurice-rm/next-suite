import { mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { TargetAction } from '../answers/target-action.ts'
import type { ProjectPlan } from '../compose/compose-project.ts'
import { writeProject } from './write-project.ts'

const planOf = (files: Record<string, string>): ProjectPlan => ({
  files: Object.entries(files).map(([path, content]) => ({ path, content, origin: 'base' })),
  dependencies: {},
  devDependencies: {},
  packageManager: undefined,
  projectPackageManager: 'npm',
  installArgs: ['install'],
  postSteps: [],
  summary: { stack: [], nextSteps: [] },
})

const BROKEN_PLAN = planOf({
  'a.txt': 'one',
  'src/lib/db.ts': 'two',
  'src/lib/db.ts/inner.ts': 'three',
})

let root: string

const write = (plan: ProjectPlan, directory: string, action: TargetAction = 'create') =>
  writeProject(plan, { directory: join(root, directory), action, cwd: root })

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'next-suite-write-'))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('writeProject', () => {
  it('creates the directory and every file of the plan', async () => {
    await write(planOf({ 'package.json': '{}\n', 'app/page.tsx': 'page' }), 'my-app')

    expect(await readFile(join(root, 'my-app/app/page.tsx'), 'utf8')).toBe('page')
    expect(await readFile(join(root, 'my-app/package.json'), 'utf8')).toBe('{}\n')
  })

  it('writes into an existing empty directory', async () => {
    await mkdir(join(root, 'empty'))

    await write(planOf({ 'a.txt': 'a' }), 'empty')

    expect(await readdir(join(root, 'empty'))).toEqual(['a.txt'])
  })

  it('replaces nothing below a harmless directory, such as .vscode/settings.json', async () => {
    await mkdir(join(root, 'fresh/.vscode'), { recursive: true })
    await writeFile(join(root, 'fresh/.vscode/settings.json'), 'mine')

    await expect(write(planOf({ '.vscode/settings.json': 'generated' }), 'fresh')).rejects.toThrow(
      'writing',
    )
    expect(await readFile(join(root, 'fresh/.vscode/settings.json'), 'utf8')).toBe('mine')
  })

  it('refuses a directory that is not empty and leaves it untouched', async () => {
    await mkdir(join(root, 'used'))
    await writeFile(join(root, 'used/keep.txt'), 'mine')

    await expect(write(planOf({ 'a.txt': 'a' }), 'used')).rejects.toThrow('is not empty')
    expect(await readdir(join(root, 'used'))).toEqual(['keep.txt'])
  })

  it('refuses a path that is a file', async () => {
    await writeFile(join(root, 'file'), '')

    await expect(write(planOf({ 'a.txt': 'a' }), 'file')).rejects.toThrow('is not a directory')
  })

  it('removes the directory it created when writing fails', async () => {
    await expect(write(BROKEN_PLAN, 'my-app')).rejects.toThrow('what this run created was removed')
    expect(await readdir(root)).toEqual([])
  })

  it('removes the files it wrote from an existing directory when writing fails', async () => {
    await mkdir(join(root, 'empty'))

    await expect(write(BROKEN_PLAN, 'empty')).rejects.toThrow('what this run created was removed')
    expect(await readdir(join(root, 'empty'), { recursive: true })).toEqual([])
  })

  it('writes over harmless files such as .gitignore in a directory that counts as empty', async () => {
    await mkdir(join(root, 'repo/.git'), { recursive: true })
    await writeFile(join(root, 'repo/.gitignore'), 'old')

    await write(planOf({ '.gitignore': 'new', 'a.txt': 'a' }), 'repo')

    expect(await readFile(join(root, 'repo/.gitignore'), 'utf8')).toBe('new')
  })

  it('empties a directory but .git before writing', async () => {
    await mkdir(join(root, 'used/.git'), { recursive: true })
    await writeFile(join(root, 'used/old.txt'), 'old')

    await write(planOf({ 'a.txt': 'a' }), 'used', 'empty')

    expect((await readdir(join(root, 'used'))).sort()).toEqual(['.git', 'a.txt'])
  })

  it('refuses to empty the current directory', async () => {
    await writeFile(join(root, 'old.txt'), 'old')

    await expect(
      writeProject(planOf({ 'a.txt': 'a' }), { directory: root, action: 'empty', cwd: root }),
    ).rejects.toThrow('refusing to empty')
    expect(await readdir(root)).toEqual(['old.txt'])
  })

  it('keeps other files and writes over existing ones with overwrite, never through a link', async () => {
    await mkdir(join(root, 'used'))
    await writeFile(join(root, 'used/keep.txt'), 'mine')
    await writeFile(join(root, 'used/a.txt'), 'old')
    await writeFile(join(root, 'outside.txt'), 'outside')
    await symlink(join(root, 'outside.txt'), join(root, 'used/link.txt'))

    await write(planOf({ 'a.txt': 'new' }), 'used', 'overwrite')

    expect(await readFile(join(root, 'used/a.txt'), 'utf8')).toBe('new')
    expect(await readFile(join(root, 'used/keep.txt'), 'utf8')).toBe('mine')
    await expect(write(planOf({ 'link.txt': 'x' }), 'used', 'overwrite')).rejects.toThrow(
      'what this run created was removed',
    )
    expect(await readFile(join(root, 'outside.txt'), 'utf8')).toBe('outside')
  })

  it('never writes through a linked directory inside the target', async () => {
    await mkdir(join(root, 'used'))
    await mkdir(join(root, 'outside'))
    await symlink(join(root, 'outside'), join(root, 'used/app'))

    await expect(write(planOf({ 'app/page.tsx': 'x' }), 'used', 'overwrite')).rejects.toThrow(
      'what this run created was removed',
    )
    expect(await readdir(join(root, 'outside'))).toEqual([])
  })

  it('keeps harmless files with --empty when nothing else is in the way', async () => {
    await mkdir(join(root, 'repo'))
    await writeFile(join(root, 'repo/LICENSE'), 'mine')

    await write(planOf({ 'a.txt': 'a' }), 'repo', 'empty')

    expect(await readFile(join(root, 'repo/LICENSE'), 'utf8')).toBe('mine')
  })
})
