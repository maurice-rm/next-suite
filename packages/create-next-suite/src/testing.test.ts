import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

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

  it('names the reason when the project cannot be generated, such as a plugin address', async () => {
    await expect(createTestProject({ plugins: ['./greet'], parent: root })).rejects.toThrow(
      /could not generate the test project:\n.*--plugin cannot be used/,
    )
  })
})
