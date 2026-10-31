import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { PROJECT_PATHS } from '../project-config/project-paths.ts'
import { commitAll, initRepository } from '../test-support/git.ts'
import { setUpCreateRuns } from '../test-support/run-create-harness.ts'
import { runNextSuiteIn } from '../test-support/run-next-suite-harness.ts'

const { run: create, pathOf, write } = setUpCreateRuns()

const PROJECT = 'my-app'

const read = (path: string) => readFile(pathOf(join(PROJECT, path)), 'utf8')

const nextSuite = (argv: string[]) =>
  runNextSuiteIn({ root: pathOf('.'), cwd: pathOf(PROJECT) }, argv)

const createProject = async (flags: string[] = []) => {
  const created = await create([PROJECT, '--yes', '--no-ci', '--no-git', '--no-install', ...flags])
  expect(created.error).toBe('')
  initRepository(pathOf(PROJECT))
  commitAll(pathOf(PROJECT), 'chore: initial commit')
}

const GREETING = {
  'greeting/plugin.ts': [
    "import { definePlugin } from 'create-next-suite/plugin'",
    '',
    'export default definePlugin({',
    "  name: 'greeting',",
    "  title: 'Greeting',",
    "  options: { tone: { question: 'Which tone?', choices: ['friendly', 'formal'], default: 'friendly' } },",
    "  files: { 'lib/greeting.ts': { source: 'files/greeting.ts', edit: (file, { options }) => file.setVariable('tone', JSON.stringify(options.tone)) } },",
    '})',
    '',
  ].join('\n'),
  'greeting/files/greeting.ts': 'export const tone = "friendly"\n',
}

describe('next-suite add', () => {
  it('adds a built-in plugin to the config and updates the project', async () => {
    await createProject(['--no-logging'])

    const result = await nextSuite(['add', 'pino'])

    expect(result).toMatchObject({ exitCode: 0, error: '' })
    expect(result.output).toMatch(/^Added pino to next-suite\.config\.ts\.\n/)
    expect(result.output).toContain('Added:\n  lib/logger.ts\n')
    expect(await read(PROJECT_PATHS.config)).toContain('    "agents-md",\n    "pino",\n  ],')
  })

  it('adds a plugin by its path with answers to its options', async () => {
    await createProject()
    await write(GREETING)

    const result = await nextSuite(['add', '../greeting', '--tone', 'formal'])

    expect(result).toMatchObject({ exitCode: 0, error: '' })
    const config = await read(PROJECT_PATHS.config)
    expect(config).toContain('    "../greeting",\n')
    expect(config).toContain('greeting: { tone: "formal" }')
    expect(await read('lib/greeting.ts')).toBe('export const tone = "formal"\n')
  })

  it('refuses a plugin the config selects already, and an unknown name', async () => {
    await createProject()

    const selected = await nextSuite(['add', 'pino'])
    const unknown = await nextSuite(['add', 'pinot'])

    expect(selected.error).toContain('next-suite.config.ts selects pino already')
    expect(unknown.error).toContain(
      'pinot is no built-in plugin; name a plugin of your own by its path, such as ./next-suite/plugins/pinot, or by its address',
    )
  })

  it('restores the config when the update after it fails', async () => {
    await createProject()
    const before = await read(PROJECT_PATHS.config)

    const result = await nextSuite(['add', 'biome'])

    expect(result.exitCode).toBe(1)
    expect(result.error).toContain('next-suite.config.ts is restored as it was')
    expect(await read(PROJECT_PATHS.config)).toBe(before)
  })
})

describe('next-suite disable', () => {
  it('disables a plugin in the config and removes what it wrote', async () => {
    await createProject()

    const result = await nextSuite(['disable', 'seo'])

    expect(result).toMatchObject({ exitCode: 0, error: '' })
    expect(result.output).toMatch(/^Disabled seo in next-suite\.config\.ts\.\n/)
    expect(await read(PROJECT_PATHS.config)).toContain('disable: ["seo"]')
    expect(existsSync(pathOf(`${PROJECT}/app/robots.ts`))).toBe(false)
  })

  it('refuses a plugin the project does not run', async () => {
    await createProject(['--no-logging'])

    const result = await nextSuite(['disable', 'pino'])

    expect(result.exitCode).toBe(1)
    expect(result.error).toContain('the project does not run pino')
  })
})
