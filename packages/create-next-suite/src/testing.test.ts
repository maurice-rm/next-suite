import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { writeFiles } from './test-support/write-files.ts'
import { createTestProject } from './testing.ts'

let root: string

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'next-suite-testing-'))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('createTestProject', () => {
  it('generates a project with the answers given and the defaults for the rest', async () => {
    const project = await createTestProject({
      plugins: [],
      answers: { linter: 'biome' },
      parent: root,
    })

    expect(await readFile(join(project.directory, 'biome.json'), 'utf8')).toContain('"$schema"')
    expect(project.output).toContain('test-app is ready')
  })

  it('generates a project with a plugin from an address, trusted for the test', async () => {
    const repository = join(root, 'hello-repository')
    await writeFiles(repository, {
      'plugin.ts': [
        "import { definePlugin } from 'create-next-suite/plugin'",
        "export default definePlugin({ name: 'hello', title: 'Hello', files: { 'hello.txt': 'files/hello.txt' } })",
        '',
      ].join('\n'),
      'files/hello.txt': 'hi\n',
    })
    const git = (...args: string[]) => execFileSync('git', ['-C', repository, ...args])
    git('init', '--quiet', '--initial-branch', 'main')
    git('add', '.')
    git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '--quiet', '-m', 'init')

    const project = await createTestProject({
      plugins: [`git+file://${repository}#main`],
      answers: { hello: true },
      parent: root,
    })

    expect(await readFile(join(project.directory, 'hello.txt'), 'utf8')).toBe('hi\n')
    expect(existsSync(join(root, 'next-suite-config.json'))).toBe(false)
  })

  it('names the reason when the project cannot be generated, such as a missing plugin', async () => {
    await expect(createTestProject({ plugins: ['./greet'], parent: root })).rejects.toThrow(
      /could not generate the test project:\n.*cannot load the plugin \.\/greet: .* does not exist/,
    )
  })
})
