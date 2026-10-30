import { mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { writeFiles } from '../test-support/write-files.ts'
import { readProjectInputs } from './read-project-inputs.ts'

let root: string

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'next-suite-inputs-'))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('readProjectInputs', () => {
  it('reads every file under next-suite/ by its project path, without node_modules and .git', async () => {
    await writeFiles(root, {
      'next-suite/plugins/tweaks/plugin.ts': 'export default {}\n',
      'next-suite/overrides/app/page.tsx': 'page\n',
      'next-suite/plugins/tweaks/node_modules/x/index.js': 'x\n',
      'next-suite/.git/HEAD': 'ref\n',
      'app/page.tsx': 'not an input\n',
    })

    expect(await readProjectInputs(root)).toEqual(
      new Map([
        ['next-suite/overrides/app/page.tsx', 'page\n'],
        ['next-suite/plugins/tweaks/plugin.ts', 'export default {}\n'],
      ]),
    )
  })

  it('reads nothing when the project has no next-suite/ directory', async () => {
    expect(await readProjectInputs(root)).toEqual(new Map())
  })

  it('refuses a binary file and a link, naming them', async () => {
    await writeFiles(root, { 'next-suite/overrides/app/page.tsx': 'page\n' })
    await writeFile(join(root, 'next-suite/overrides/app/icon.png'), Buffer.from([0x89, 0, 1]))

    await expect(readProjectInputs(root)).rejects.toThrow(
      'next-suite/overrides/app/icon.png is a binary file; next-suite/ holds text files only',
    )

    await rm(join(root, 'next-suite/overrides/app/icon.png'))
    await symlink(join(root, 'app'), join(root, 'next-suite/overrides/link'))
    await expect(readProjectInputs(root)).rejects.toThrow(
      'next-suite/overrides/link is a link or no regular file',
    )
  })
})
