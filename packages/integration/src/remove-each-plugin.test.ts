import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { CategoriesFile, ListedCategory } from 'create-next-suite/plugin'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { PROJECT_NAME } from './project-name.ts'
import { runCli } from './run-cli.ts'

const CATEGORIES_URL = new URL(
  'categories.json',
  import.meta.resolve('create-next-suite/package.json'),
)
/** Starts the CLI once per category; generous for a slow CI runner. */
const TIMEOUT_MS = 120_000
/** `NEXT_SUITE_ENGINE`: the manifest engine, and the engine of plugins written as plugin.ts. */
const ENGINES = ['v1', 'v2']

let cwd: string
let removableCategories: ListedCategory[]

const emptyAnswerOf = (category: ListedCategory): [] | null =>
  category.cardinality === 'many' ? [] : null

beforeAll(async () => {
  cwd = await mkdtemp(join(tmpdir(), 'next-suite-remove-'))
  const sections = JSON.parse(await readFile(CATEGORIES_URL, 'utf8')) as CategoriesFile
  removableCategories = sections
    .flatMap((section) => section.categories)
    .filter((category) => category.cardinality !== 'one')
})

afterAll(async () => {
  await rm(cwd, { recursive: true, force: true })
})

describe.each(ENGINES)('the quick start without one plugin with NEXT_SUITE_ENGINE=%s', (engine) => {
  it('composes for every category left empty', {
    timeout: TIMEOUT_MS,
  }, async () => {
    for (const category of removableCategories) {
      const answers = join(cwd, `${category.id}.json`)
      await writeFile(answers, JSON.stringify({ [category.id]: emptyAnswerOf(category) }))

      const result = await runCli(
        'create-next-suite',
        [PROJECT_NAME, '--answers', answers, '--yes', '--dry-run'],
        { cwd, environment: { NEXT_SUITE_ENGINE: engine } },
      )

      expect({ category: category.id, ...result }).toMatchObject({
        category: category.id,
        exitCode: 0,
        stderr: '',
      })
    }
  })
})
