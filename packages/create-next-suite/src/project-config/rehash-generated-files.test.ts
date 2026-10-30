import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { writeFiles } from '../test-support/write-files.ts'
import { hashFileContent, type LockFile, parseLockFile, renderLockFile } from './lock-file.ts'
import { rehashGeneratedFiles } from './rehash-generated-files.ts'

const LOCK: LockFile = {
  generator: { name: 'create-next-suite', version: '2.0.0' },
  project: {
    name: 'my-app',
    srcDir: false,
    importAlias: '@/*',
    reactCompiler: false,
    cacheComponents: true,
  },
  plugins: [],
  disable: [],
  answers: {},
  files: {
    'app/page.tsx': hashFileContent('generated\n'),
    'app/gone.tsx': hashFileContent('gone\n'),
  },
  provenance: { order: [], points: {}, files: {} },
}

let root: string

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'next-suite-rehash-'))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('rehashGeneratedFiles', () => {
  it('records each generated file as it is now, such as after a format run', async () => {
    await writeFiles(root, {
      '.next-suite/lock.json': renderLockFile(LOCK),
      'app/page.tsx': 'formatted\n',
      'app/mine.tsx': 'not generated\n',
    })

    await rehashGeneratedFiles(root)
    const path = join(root, '.next-suite/lock.json')

    expect(parseLockFile(await readFile(path, 'utf8'), path)).toEqual({
      ...LOCK,
      files: {
        'app/page.tsx': hashFileContent('formatted\n'),
        'app/gone.tsx': hashFileContent('gone\n'),
      },
    })
  })
})
