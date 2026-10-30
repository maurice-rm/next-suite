import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import ansis from 'ansis'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { collectOutput } from '../test-support/collect-output.ts'
import { readJson } from '../test-support/read-json.ts'
import { stubRemote } from '../test-support/stub-remote.ts'
import { writeFiles } from '../test-support/write-files.ts'
import { runNextSuite } from './run-next-suite.ts'

const PLUGIN_ENTRY = fileURLToPath(new URL('../plugin.ts', import.meta.url))

let root: string

const run = async (argv: string[]) => {
  const output = collectOutput()
  const error = collectOutput()
  const exitCode = await runNextSuite({
    argv,
    cliVersion: '2.0.0',
    cwd: root,
    output: output.stream,
    error: error.stream,
    remote: stubRemote(root),
    userConfigPath: join(root, 'config.json'),
    pluginEntry: PLUGIN_ENTRY,
    runCommand: async () => ({ isSuccess: false, output: 'npm is not available here' }),
  })
  return { exitCode, output: output.text(), error: ansis.strip(error.text()) }
}

const config = () => readJson(join(root, 'config.json'))

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'next-suite-command-'))
  await writeFiles(root, {
    'registry/registry.json': JSON.stringify({
      name: '@acme',
      plugins: [{ name: 'mail', path: 'mail', description: 'Sends mail.' }],
    }),
  })
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('next-suite registry', () => {
  it('adds a registry, optionally trusted, lists it and its plugins, and removes it', async () => {
    expect((await run(['registry', 'add', '@acme', './registry', '--trust'])).output).toBe(
      'Added @acme with 1 plugin, trusted\n',
    )
    const registry = join(root, 'registry')
    expect(await config()).toEqual({
      trust: ['@acme/*'],
      registries: { '@acme': registry },
      trustedContent: {},
    })
    expect((await run(['registry', 'list'])).output).toBe(`@acme  ${registry}\n`)
    expect((await run(['registry', 'add', '@acme', './registry'])).error).toContain(
      'pass --replace to point it elsewhere',
    )
    expect((await run(['registry', 'list', '@acme'])).output).toBe('@acme/mail  Sends mail.\n')
    expect((await run(['registry', 'remove', '@acme'])).output).toBe('Removed @acme\n')
    expect(await config()).toEqual({ trust: [], registries: {}, trustedContent: {} })
  })

  it('rejects a registry name without a scope', async () => {
    const result = await run(['registry', 'add', 'acme', './registry'])

    expect(result.error).toBe(
      'next-suite: "acme" is not a registry name; use a scoped name such as @acme\n',
    )
  })

  it('rejects a registry whose index has another name', async () => {
    const result = await run(['registry', 'add', '@other', './registry'])

    expect(result.exitCode).toBe(1)
    expect(result.error).toBe('next-suite: ./registry is the registry @acme, not @other\n')
  })
})

describe('next-suite trust', () => {
  it('adds, lists and removes trusted patterns', async () => {
    await run(['trust', 'add', 'github:acme/*'])

    expect((await run(['trust', 'list'])).output).toBe('github:acme/*\n')
    expect((await run(['trust', 'remove', 'github:acme/*'])).output).toBe(
      'No longer trusted: github:acme/*\n',
    )
    expect((await run(['trust', 'remove', 'github:acme/*'])).error).toContain('is not trusted')
  })
})

describe('next-suite plugin validate', () => {
  const pluginTs = (fields: string, before = '') =>
    `import { definePlugin } from 'create-next-suite/plugin'\n${before}\nexport default definePlugin({ ${fields} })\n`

  it('checks a plugin, runs it on its own and summarizes it', async () => {
    await writeFiles(root, {
      'mail/plugin.ts': pluginTs(
        "name: 'mail', title: 'Mail', section: 'Integrations', options: { preview: { question: 'Preview?', type: 'boolean', default: false } }, provides: { mailer: 'smtp' }",
      ),
      'mail/package.json': JSON.stringify({ devDependencies: { 'create-next-suite': '2.0.0' } }),
    })

    const result = await run(['plugin', 'validate', 'mail'])

    expect(result.exitCode).toBe(0)
    expect(result.output).toBe(
      [
        'mail (Mail) is a valid plugin',
        '  category: none, an extra in Integrations',
        '  options: preview',
        '  provides: mailer',
        '',
      ].join('\n'),
    )
  })

  it('hints where create-next-suite belongs in the package.json', async () => {
    await writeFiles(root, {
      'bare/plugin.ts': pluginTs("name: 'bare', title: 'Bare'"),
      'listed/plugin.ts': pluginTs("name: 'listed', title: 'Listed'"),
      'listed/package.json': JSON.stringify({ name: 'listed' }),
    })

    expect((await run(['plugin', 'validate', 'bare'])).output).toContain(
      'hint: add a package.json with create-next-suite under devDependencies to type-check plugin.ts',
    )
    expect((await run(['plugin', 'validate', 'listed'])).output).toContain(
      'hint: add create-next-suite under devDependencies to type-check plugin.ts',
    )
  })

  it.each([
    {
      problem: 'metadata that needs running',
      source: pluginTs("name: NAME, title: 'Mail'"),
      message: 'plugin.ts: name is no fixed value',
    },
    {
      problem: 'an unknown category',
      source: pluginTs("name: 'mail', title: 'Mail', category: 'mailer'"),
      message: 'it belongs to the unknown category mailer',
    },
    {
      problem: 'a plugin.ts that throws',
      source: pluginTs("name: 'mail', title: 'Mail'", "throw new Error('no')"),
      message: 'its plugin.ts does not run',
    },
  ])('reports $problem', async ({ source, message }) => {
    await writeFiles(root, { 'mail/plugin.ts': source })

    const result = await run(['plugin', 'validate', 'mail'])

    expect(result.exitCode).toBe(1)
    expect(result.error).toContain(message)
  })

  it('reports a directory without plugin.ts', async () => {
    await writeFiles(root, { 'empty/readme.md': '' })

    expect((await run(['plugin', 'validate', 'empty'])).error).toContain('no plugin.ts')
  })
})
