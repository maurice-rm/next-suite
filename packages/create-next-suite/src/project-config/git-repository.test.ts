import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { commitAll, git, initRepository } from '../test-support/git.ts'
import { writeFiles } from '../test-support/write-files.ts'
import {
  findUncommittedPaths,
  lastCommitOf,
  readCommittedFiles,
  saveUncommittedChanges,
} from './git-repository.ts'
import { ProjectConfigError } from './project-config-error.ts'

let repository: string
let project: string

beforeEach(async () => {
  repository = await mkdtemp(join(tmpdir(), 'next-suite-git-'))
  project = join(repository, 'apps', 'web')
  initRepository(repository)
  await writeFiles(project, {
    'next-suite.config.ts': 'config\n',
    'app/page.tsx': 'page\n',
    'next-suite/overrides/app/page.tsx': 'override\n',
  })
  await writeFiles(repository, { 'README.md': 'repository\n' })
  commitAll(repository, 'initial')
})

afterEach(async () => {
  await rm(repository, { recursive: true, force: true })
})

describe('findUncommittedPaths', () => {
  it('lists changed, staged and untracked files below the project, relative to it', async () => {
    await writeFiles(project, {
      'app/page.tsx': 'changed\n',
      'app/new.tsx': 'new\n',
    })
    await writeFiles(repository, { 'README.md': 'outside the project\n' })
    await writeFile(join(project, 'next-suite.config.ts'), 'staged\n')
    git(project, ['add', 'next-suite.config.ts'])

    expect((await findUncommittedPaths(project)).sort()).toEqual([
      'app/new.tsx',
      'app/page.tsx',
      'next-suite.config.ts',
    ])
  })

  it('answers nothing for a clean tree', async () => {
    expect(await findUncommittedPaths(project)).toEqual([])
  })

  it('fails outside a git repository', async () => {
    const outside = await mkdtemp(join(tmpdir(), 'next-suite-no-git-'))
    try {
      await expect(findUncommittedPaths(outside)).rejects.toThrow(ProjectConfigError)
      await expect(findUncommittedPaths(outside)).rejects.toThrow(/needs Git/)
    } finally {
      await rm(outside, { recursive: true, force: true })
    }
  })
})

describe('lastCommitOf', () => {
  it('answers the last commit that changed a path of the project, or nothing', async () => {
    const first = git(repository, ['rev-parse', 'HEAD']).trim()
    await writeFiles(repository, { 'README.md': 'later\n' })
    commitAll(repository, 'later')

    expect(await lastCommitOf(project, 'app/page.tsx')).toBe(first)
    expect(await lastCommitOf(project, 'missing.ts')).toBeUndefined()
  })
})

describe('readCommittedFiles', () => {
  it('reads the files of a commit below the given paths of the project', async () => {
    const commit = git(repository, ['rev-parse', 'HEAD']).trim()
    await writeFiles(project, {
      'next-suite/overrides/app/page.tsx': 'changed later\n',
    })

    expect(
      await readCommittedFiles(project, {
        commit,
        paths: ['next-suite.config.ts', 'next-suite'],
      }),
    ).toEqual(
      new Map([
        ['next-suite.config.ts', 'config\n'],
        ['next-suite/overrides/app/page.tsx', 'override\n'],
      ]),
    )
  })

  it('answers nothing for a path the commit does not have', async () => {
    const commit = git(repository, ['rev-parse', 'HEAD']).trim()

    expect(await readCommittedFiles(project, { commit, paths: ['missing'] })).toEqual(new Map())
  })
})

describe('saveUncommittedChanges', () => {
  it('records the changes in a commit without touching the tree, and answers nothing without changes', async () => {
    expect(await saveUncommittedChanges(project)).toBeUndefined()
    await writeFiles(project, { 'app/page.tsx': 'unsaved\n' })

    const commit = await saveUncommittedChanges(project)

    expect(commit).toMatch(/^[0-9a-f]{40}$/)
    expect(git(repository, ['show', `${commit}:apps/web/app/page.tsx`])).toBe('unsaved\n')
    expect(await findUncommittedPaths(project)).toEqual(['app/page.tsx'])
  })
})
