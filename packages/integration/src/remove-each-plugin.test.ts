import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { runCli } from './run-cli.ts'

type Category = { id: string; cardinality: 'one' | 'at-most-one' | 'many'; default: unknown }

const CATEGORIES_URL = new URL(
  'categories.json',
  import.meta.resolve('create-next-suite/package.json'),
)

let cwd: string
let removable: Category[]

beforeAll(async () => {
  cwd = await mkdtemp(join(tmpdir(), 'next-suite-remove-'))
  const sections = JSON.parse(await readFile(CATEGORIES_URL, 'utf8')) as {
    categories: Category[]
  }[]
  removable = sections
    .flatMap((section) => section.categories)
    .filter((category) => category.cardinality !== 'one')
})

afterAll(async () => {
  await rm(cwd, { recursive: true, force: true })
})

/** Every plugin of the quick start can go on its own, and the rest still composes. */
describe('the quick start without one plugin', () => {
  it('composes for every category left empty', async () => {
    for (const category of removable) {
      const answers = join(cwd, `${category.id}.json`)
      await writeFile(
        answers,
        JSON.stringify({ [category.id]: category.cardinality === 'many' ? [] : null }),
      )

      const result = await runCli(
        'create-next-suite',
        ['my-app', '--answers', answers, '--yes', '--dry-run'],
        { cwd },
      )

      expect({ category: category.id, ...result }).toMatchObject({
        category: category.id,
        exitCode: 0,
        stderr: '',
      })
    }
  })
})
