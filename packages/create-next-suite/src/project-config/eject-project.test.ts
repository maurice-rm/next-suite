import { existsSync } from 'node:fs'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { writeFiles } from '../test-support/write-files.ts'
import { ejectProject } from './eject-project.ts'

const PACKAGE_JSON = `${JSON.stringify(
  {
    name: 'my-app',
    devDependencies: { 'create-next-suite': '2.0.0', typescript: '5.9.3' },
  },
  null,
  2,
)}\n`

const TSCONFIG = `${JSON.stringify(
  { compilerOptions: { strict: true }, include: ['.next-suite/types.d.ts', '**/*.ts'] },
  null,
  2,
)}\n`

let root: string

const writeProject = (extra: Record<string, string> = {}) =>
  writeFiles(root, {
    'next-suite.config.ts': 'export default {}\n',
    '.next-suite/lock.json': '{}\n',
    '.next-suite/types.d.ts': 'export {}\n',
    'package.json': PACKAGE_JSON,
    'tsconfig.json': TSCONFIG,
    'knip.config.ts': 'const config = { entry: ["next-suite.config.ts"] }\n',
    'app/page.tsx': 'page\n',
    ...extra,
  })

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'next-suite-eject-'))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('ejectProject', () => {
  it('removes the config, .next-suite/, the devDependency and the registry types entry', async () => {
    await writeProject()

    const result = await ejectProject(root, { force: false })

    expect(existsSync(join(root, 'next-suite.config.ts'))).toBe(false)
    expect(existsSync(join(root, '.next-suite'))).toBe(false)
    expect(await readFile(join(root, 'app/page.tsx'), 'utf8')).toBe('page\n')
    expect(JSON.parse(await readFile(join(root, 'package.json'), 'utf8')).devDependencies).toEqual({
      typescript: '5.9.3',
    })
    expect(JSON.parse(await readFile(join(root, 'tsconfig.json'), 'utf8')).include).toEqual([
      '**/*.ts',
    ])
    expect(result.removed).toEqual([
      'next-suite.config.ts',
      '.next-suite/',
      'the devDependency create-next-suite in package.json',
      '.next-suite/types.d.ts in the include of tsconfig.json',
    ])
    expect(result.notes).toEqual([
      'knip.config.ts still names next-suite.config.ts as an entry; remove it there',
    ])
  })

  it('refuses while next-suite/ holds plugins or overrides, listing them, unless forced', async () => {
    await writeProject({
      'next-suite/plugins/tweaks/plugin.ts': 'export default {}\n',
      'next-suite/overrides/app/page.tsx': 'mine\n',
    })

    await expect(ejectProject(root, { force: false })).rejects.toThrow(
      'next-suite/ holds files of your own that eject would delete:\n  next-suite/overrides/app/page.tsx\n  next-suite/plugins/tweaks/plugin.ts\nmove them out of next-suite/ first, or pass --force to delete them too',
    )
    expect(existsSync(join(root, 'next-suite.config.ts'))).toBe(true)

    const result = await ejectProject(root, { force: true })

    expect(existsSync(join(root, 'next-suite'))).toBe(false)
    expect(result.removed).toContain('next-suite/')
  })

  it('leaves a tsconfig.json it cannot read as JSON to the user', async () => {
    await writeProject({
      'tsconfig.json': '{ // comments\n  "include": [".next-suite/types.d.ts"] }\n',
    })

    const result = await ejectProject(root, { force: false })

    expect(result.notes).toContain(
      'tsconfig.json is no plain JSON; remove .next-suite/types.d.ts from its include yourself',
    )
  })
})
