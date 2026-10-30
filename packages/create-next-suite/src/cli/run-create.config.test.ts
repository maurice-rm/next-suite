import { readdir, readFile } from 'node:fs/promises'
import { join, relative } from 'node:path'

import { describe, expect, it } from 'vitest'

import { parseLockFile } from '../project-config/lock-file.ts'
import { readJson } from '../test-support/read-json.ts'
import { setUpCreateRuns } from '../test-support/run-create-harness.ts'

const { run, pathOf, write } = setUpCreateRuns()

const readLock = async (path: string) => parseLockFile(await readFile(path, 'utf8'), path)

const QUIET = ['--no-git', '--no-install']

/** Every file below a directory by its relative path, with its content. */
const readTree = async (directory: string): Promise<Map<string, string>> => {
  const entries = await readdir(directory, { recursive: true, withFileTypes: true })
  const files = entries
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name))
    .sort()
  return new Map(
    await Promise.all(
      files.map(async (file) => [relative(directory, file), await readFile(file, 'utf8')] as const),
    ),
  )
}

const TWEAKS_PLUGIN = [
  "import { definePlugin } from 'create-next-suite/plugin'",
  '',
  'export default definePlugin({',
  "  name: 'tweaks',",
  "  title: 'Tweaks',",
  "  files: { 'tweaks.txt': 'files/tweaks.txt' },",
  '})',
  '',
].join('\n')

const configWith = (plugins: string): string =>
  [
    "import { definePlugin, defineSuiteConfig } from 'create-next-suite/config'",
    '',
    'export default defineSuiteConfig({',
    "  project: { name: 'first' },",
    `  plugins: [${plugins}],`,
    '})',
    '',
  ].join('\n')

describe('runCreate with --config', () => {
  it('creates the same project again from the config of a project', async () => {
    await run(['first', '--yes', '--linter', 'biome', '--no-ci', ...QUIET])

    const again = await run(['again', '--config', 'first/next-suite.config.ts', ...QUIET])

    expect(again).toMatchObject({ exitCode: 0, error: '' })
    expect(await readTree(pathOf('again'))).toEqual(await readTree(pathOf('first')))
  })

  it('creates the project in a directory named after it without a directory argument', async () => {
    await run(['first', '--yes', ...QUIET])
    await write({
      'shared/next-suite.config.ts': await readFile(pathOf('first/next-suite.config.ts'), 'utf8'),
    })
    await run(['--config', 'shared/next-suite.config.ts', '--empty', ...QUIET])

    expect((await readJson(pathOf('first/package.json'))).name).toBe('first')
  })

  it('runs the project plugins and plugins defined in place, and applies the overrides', async () => {
    await write({
      'source/next-suite.config.ts': configWith(
        "'pnpm', './next-suite/plugins/tweaks', definePlugin({ name: 'site-url', title: 'Site URL', scripts: { 'site-url': 'echo site' } })",
      ),
      'source/next-suite/plugins/tweaks/plugin.ts': TWEAKS_PLUGIN,
      'source/next-suite/plugins/tweaks/files/tweaks.txt': 'tweaked\n',
      'source/next-suite/overrides/app/not-found.tsx': 'export default function NotFound() {}\n',
    })

    const result = await run(['first', '--config', 'source/next-suite.config.ts', ...QUIET])
    const lock = await readLock(pathOf('first/.next-suite/lock.json'))

    expect(result).toMatchObject({ exitCode: 0, error: '' })
    expect(await readFile(pathOf('first/tweaks.txt'), 'utf8')).toBe('tweaked\n')
    expect((await readJson(pathOf('first/package.json'))).scripts).toMatchObject({
      'site-url': 'echo site',
    })
    expect(await readFile(pathOf('first/app/not-found.tsx'), 'utf8')).toBe(
      'export default function NotFound() {}\n',
    )
    expect(await readFile(pathOf('first/next-suite/plugins/tweaks/plugin.ts'), 'utf8')).toBe(
      TWEAKS_PLUGIN,
    )
    expect(await readFile(pathOf('first/next-suite.config.ts'), 'utf8')).toContain('site-url')
    expect(lock.plugins).toEqual([
      { name: 'pnpm', source: 'builtin', version: '2.0.0' },
      { name: 'site-url', source: 'inline' },
      {
        name: 'tweaks',
        source: './next-suite/plugins/tweaks',
        contentHash: expect.stringMatching(/^sha256-/),
      },
    ])
    expect(lock.provenance.files['app/not-found.tsx']?.at(-1)).toEqual({
      plugin: 'override',
      operation: 'replace with next-suite/overrides/app/not-found.tsx',
      kind: 'override',
    })
    expect(lock.files).not.toHaveProperty('next-suite/plugins/tweaks/plugin.ts')
  })

  it('fails for a plugin defined in place under the name of another plugin', async () => {
    await write({
      'source/next-suite.config.ts': configWith(
        "'pnpm', definePlugin({ name: 'pino', title: 'My pino' })",
      ),
    })

    const result = await run(['first', '--config', 'source/next-suite.config.ts', ...QUIET])

    expect(result.exitCode).toBe(1)
    expect(result.error).toContain('two plugins are named pino')
  })

  it('takes flags for what happens after writing, but no answer', async () => {
    await write({ 'source/next-suite.config.ts': configWith("'pnpm'") })

    const answered = await run([
      'first',
      '--config',
      'source/next-suite.config.ts',
      '--linter',
      'biome',
    ])

    expect(answered.exitCode).toBe(1)
    expect(answered.error).toContain(
      `--config takes every answer from ${pathOf('source/next-suite.config.ts')}; change it there instead of passing flags for: linter`,
    )
  })

  it('fails for a plugin the config names that is neither built in nor loaded', async () => {
    await write({ 'source/next-suite.config.ts': configWith("'pnpm', 'pinot'") })

    const result = await run(['first', '--config', 'source/next-suite.config.ts', ...QUIET])

    expect(result.exitCode).toBe(1)
    expect(result.error).toContain('next-suite.config.ts names the plugin "pinot"')
  })

  it('cannot be combined with an answer file or --plugin', async () => {
    await write({ 'source/next-suite.config.ts': configWith("'pnpm'"), 'answers.json': '{}' })

    const result = await run([
      'first',
      '--config',
      'source/next-suite.config.ts',
      '--answers',
      'answers.json',
    ])

    expect(result.exitCode).toBe(1)
    expect(result.error).toContain(
      "option '--config <file>' cannot be used with option '--answers <file>'",
    )
  })
})
