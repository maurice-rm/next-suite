import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createTestProject } from './testing.ts'

let root: string

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'next-suite-testing-'))
  await mkdir(join(root, 'greet'))
  await writeFile(
    join(root, 'greet/plugin.json'),
    JSON.stringify({
      name: 'greet',
      version: '1.0.0',
      contract: '^1.0.0',
      title: 'Greet',
      description: 'Greets.',
      files: [{ source: 'greet.txt', target: 'greet.txt' }],
    }),
  )
  await writeFile(join(root, 'greet/greet.txt'), 'hello\n')
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('createTestProject', () => {
  it('generates a project with the plugin under test and its answers', async () => {
    const project = await createTestProject({
      plugins: [join(root, 'greet')],
      answers: { greet: true },
      parent: root,
    })

    expect(await readFile(join(project.directory, 'greet.txt'), 'utf8')).toBe('hello\n')
    expect(project.output).toContain('test-app is ready')
  })

  it('names the reason when the project cannot be generated', async () => {
    await expect(
      createTestProject({ plugins: [join(root, 'missing')], parent: root }),
    ).rejects.toThrow('could not generate the test project')
  })
})
