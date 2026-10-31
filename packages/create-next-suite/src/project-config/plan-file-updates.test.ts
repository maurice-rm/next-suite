import { mkdtemp, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { writeFiles } from '../test-support/write-files.ts'
import { hashFileContent } from './lock-file.ts'
import { planFileUpdates } from './plan-file-updates.ts'

const LAYOUT_OLD = ['<html>', '  <body>', '    {children}', '  </body>', '</html>', ''].join('\n')
const LAYOUT_MINE = LAYOUT_OLD.replace('  <body>\n', '  <body>\n    <header />\n')
const LAYOUT_NEW = LAYOUT_OLD.replace('    {children}\n', '    {children}\n    <Analytics />\n')
const PACKAGE_OLD = `${JSON.stringify({ name: 'app', scripts: { dev: 'next dev' } }, null, 2)}\n`

let project: string

const lockHashesOf = (files: Readonly<Record<string, string>>): Record<string, string> =>
  Object.fromEntries(
    Object.entries(files).map(([path, content]) => [path, hashFileContent(content)]),
  )

const plan = (old: Record<string, string>, next: Record<string, string>) =>
  planFileUpdates(project, {
    old: new Map(Object.entries(old)),
    next: new Map(Object.entries(next)),
    lockHashes: lockHashesOf(old),
  })

beforeEach(async () => {
  project = await mkdtemp(join(tmpdir(), 'next-suite-plan-updates-'))
})

afterEach(async () => {
  await rm(project, { recursive: true, force: true })
})

describe('planFileUpdates', () => {
  it('replaces, merges, adds, removes and keeps files, and says what it did to each', async () => {
    await writeFiles(project, {
      'app/layout.tsx': LAYOUT_MINE,
      'app/page.tsx': 'page\n',
      'lib/gone.ts': 'gone\n',
      'lib/edited-gone.ts': 'mine\n',
    })

    const updates = await plan(
      {
        'app/layout.tsx': LAYOUT_OLD,
        'app/page.tsx': 'page\n',
        'lib/gone.ts': 'gone\n',
        'lib/edited-gone.ts': 'generated\n',
      },
      {
        'app/layout.tsx': LAYOUT_NEW,
        'app/page.tsx': 'new page\n',
        'lib/logger.ts': 'logger\n',
      },
    )

    expect(updates.report).toEqual({
      replaced: ['app/page.tsx'],
      merged: ['app/layout.tsx'],
      added: ['lib/logger.ts'],
      removed: ['lib/gone.ts'],
      kept: [
        {
          path: 'lib/edited-gone.ts',
          reason: 'next-suite no longer writes it, but you changed it',
        },
      ],
      mergeConflicts: [],
    })
    expect(updates.changes).toEqual([
      {
        path: 'app/layout.tsx',
        content: LAYOUT_MINE.replace('    {children}\n', '    {children}\n    <Analytics />\n'),
      },
      { path: 'app/page.tsx', content: 'new page\n' },
      { path: 'lib/gone.ts', content: undefined },
      { path: 'lib/logger.ts', content: 'logger\n' },
    ])
  })

  it('reports a text merge conflict with its count and writes the markers', async () => {
    await writeFiles(project, {
      'app/layout.tsx': LAYOUT_OLD.replace('{children}', '{mine}'),
    })

    const updates = await plan(
      { 'app/layout.tsx': LAYOUT_OLD },
      { 'app/layout.tsx': LAYOUT_OLD.replace('{children}', '{theirs}') },
    )

    expect(updates.report.mergeConflicts).toEqual([
      { path: 'app/layout.tsx', kind: 'text', count: 1 },
    ])
    expect(updates.changes[0]?.content).toContain(
      '<<<<<<< yours\n    {mine}\n=======\n    {theirs}\n>>>>>>> next-suite\n',
    )
  })

  it('merges package.json by key and reports a key both sides changed with both values', async () => {
    const mine = {
      name: 'app',
      scripts: { dev: 'next dev --port 4000', studio: 'drizzle-kit studio' },
    }
    await writeFiles(project, {
      'package.json': `${JSON.stringify(mine, null, 2)}\n`,
    })

    const updates = await plan(
      { 'package.json': PACKAGE_OLD },
      {
        'package.json': `${JSON.stringify(
          {
            name: 'app',
            scripts: { dev: 'next dev --turbopack' },
            dependencies: { pino: '10.0.0' },
          },
          null,
          2,
        )}\n`,
      },
    )

    expect(updates.report.mergeConflicts).toEqual([
      {
        path: 'package.json',
        kind: 'json',
        keys: [
          {
            path: 'scripts.dev',
            ours: 'next dev --port 4000',
            theirs: 'next dev --turbopack',
          },
        ],
      },
    ])
    expect(JSON.parse(updates.changes[0]?.content ?? '')).toEqual({
      name: 'app',
      scripts: { dev: 'next dev --port 4000', studio: 'drizzle-kit studio' },
      dependencies: { pino: '10.0.0' },
    })
  })

  it('merges a JSON file with comments as text', async () => {
    const old = '{\n  // comment\n  "a": 1,\n  "keep": 0,\n  "also": 0,\n  "b": 2\n}\n'
    await writeFiles(project, {
      'tsconfig.json': old.replace('"a": 1', '"a": 10'),
    })

    const updates = await plan(
      { 'tsconfig.json': old },
      { 'tsconfig.json': old.replace('"b": 2', '"b": 20') },
    )

    expect(updates.report.merged).toEqual(['tsconfig.json'])
    expect(updates.changes[0]?.content).toBe(
      '{\n  // comment\n  "a": 10,\n  "keep": 0,\n  "also": 0,\n  "b": 20\n}\n',
    )
  })

  it('keeps a path that is no regular file in the working tree, such as a link', async () => {
    await writeFiles(project, { 'elsewhere.ts': 'elsewhere\n' })
    await symlink(join(project, 'elsewhere.ts'), join(project, 'linked.ts'))

    const updates = await plan({ 'linked.ts': 'old\n' }, { 'linked.ts': 'new\n' })

    expect(updates.report.kept).toEqual([{ path: 'linked.ts', reason: 'it is no regular file' }])
    expect(updates.changes).toEqual([])
  })
})
