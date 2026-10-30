import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { writeFiles } from '../test-support/write-files.ts'
import { loadBaseProject } from './load-base-project.ts'

let root: string

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'next-suite-base-project-'))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('loadBaseProject', () => {
  it('reads every file by its project path: app/ under the source root, dotfiles with their dot', async () => {
    await writeFiles(root, {
      'package.json': '{}\n',
      gitignore: '/node_modules\n',
      editorconfig: 'root = true\n',
      'env.example': '# env\n',
      'app/page.tsx': 'export default () => null\n',
      'app/nested/icon.svg': '<svg/>\n',
    })

    const files = await loadBaseProject(root)

    expect(Object.fromEntries(files)).toEqual({
      '.editorconfig': 'root = true\n',
      '.env.example': '# env\n',
      '.gitignore': '/node_modules\n',
      '@/app/nested/icon.svg': '<svg/>\n',
      '@/app/page.tsx': 'export default () => null\n',
      'package.json': '{}\n',
    })
  })
})
