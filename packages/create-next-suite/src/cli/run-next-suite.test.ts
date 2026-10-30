import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import ansis from 'ansis'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { collectOutput } from '../test-support/collect-output.ts'
import { stubRemote } from '../test-support/stub-remote.ts'
import { testManifestJson } from '../test-support/test-manifest.ts'
import { writeFiles } from '../test-support/write-files.ts'
import { runNextSuite } from './run-next-suite.ts'

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
  })
  return { exitCode, output: output.text(), error: ansis.strip(error.text()) }
}

const config = async () => JSON.parse(await readFile(join(root, 'config.json'), 'utf8'))

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'next-suite-command-'))
  await writeFiles(root, {
    'registry/registry.json': JSON.stringify({
      name: '@acme',
      plugins: [{ name: 'mail', path: 'mail', description: 'Sends mail.' }],
    }),
    'registry/mail/plugin.json': testManifestJson('mail'),
  })
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('next-suite registry', () => {
  it('adds a registry, optionally trusted, lists it and its plugins, and removes it', async () => {
    expect((await run(['registry', 'add', '@acme', './registry', '--trust'])).output).toBe(
      'Added @acme with 1 plugins, trusted\n',
    )
    const registry = join(root, 'registry')
    expect(await config()).toEqual({ trust: ['@acme/*'], registries: { '@acme': registry } })
    expect((await run(['registry', 'list'])).output).toBe(`@acme  ${registry}\n`)
    expect((await run(['registry', 'add', '@acme', './registry'])).error).toContain(
      'pass --replace to point it elsewhere',
    )
    expect((await run(['registry', 'list', '@acme'])).output).toBe('@acme/mail  Sends mail.\n')
    expect((await run(['registry', 'remove', '@acme'])).output).toBe('Removed @acme\n')
    expect(await config()).toEqual({ trust: [], registries: {} })
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
  it('accepts a valid plugin and names the problem of an invalid template', async () => {
    await writeFiles(root, {
      'good/plugin.json': testManifestJson('good', {
        files: [{ source: 'a.ts.hbs', target: 'a.ts' }],
      }),
      'good/a.ts.hbs': 'export const name = "{{project.name}}"\n',
      'bad/plugin.json': testManifestJson('bad', {
        files: [{ source: 'a.ts.hbs', target: 'a.ts' }],
      }),
      'bad/a.ts.hbs': '{{#with project}}{{name}}{{/with}}\n',
    })

    expect((await run(['plugin', 'validate', './good'])).output).toBe(
      'good 1.0.0 is a valid plugin\n',
    )
    const bad = await run(['plugin', 'validate', './bad'])
    expect(bad.exitCode).toBe(1)
    expect(bad.error).toContain('with')
  })
})
