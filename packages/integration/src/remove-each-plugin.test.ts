import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { PROJECT_NAME } from './project-name.ts'
import { runCli } from './run-cli.ts'

/** The fields of a category of create-next-suite this test reads. */
type Category = { id: string; cardinality: 'one' | 'at-most-one' | 'many' }

const CATEGORIES_URL = new URL(
  'src/plugin-definition/categories.ts',
  import.meta.resolve('create-next-suite/package.json'),
)
/** Starts the CLI once per category; generous for a slow CI runner. */
const TIMEOUT_MS = 120_000

let cwd: string
let removableCategories: Category[]

const emptyAnswerOf = (category: Category): [] | null =>
  category.cardinality === 'many' ? [] : null

beforeAll(async () => {
  cwd = await mkdtemp(join(tmpdir(), 'next-suite-remove-'))
  // biome-ignore lint/style/useNamingConvention: the name of the constant create-next-suite exports
  const { CATEGORIES } = (await import(CATEGORIES_URL.href)) as { CATEGORIES: Category[] }
  removableCategories = CATEGORIES.filter((category) => category.cardinality !== 'one')
})

afterAll(async () => {
  await rm(cwd, { recursive: true, force: true })
})

describe('the quick start without one plugin', () => {
  it('assembles for every category left empty', {
    timeout: TIMEOUT_MS,
  }, async () => {
    for (const category of removableCategories) {
      const answers = join(cwd, `${category.id}.json`)
      await writeFile(answers, JSON.stringify({ [category.id]: emptyAnswerOf(category) }))

      const result = await runCli(
        'create-next-suite',
        [PROJECT_NAME, '--answers', answers, '--yes', '--dry-run'],
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
