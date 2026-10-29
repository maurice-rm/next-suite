import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { Writable } from 'node:stream'

import ansis from 'ansis'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { runNextSuite } from './run-next-suite.ts'

let root: string

const write = async (files: Record<string, string>): Promise<void> => {
  for (const [path, content] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true })
    await writeFile(join(root, path), content)
  }
}

const plugin = (name: string, extra: object = {}) =>
  JSON.stringify({
    name,
    version: '1.0.0',
    contract: '^1.0.0',
    title: name,
    description: name,
    ...extra,
  })

const run = async (argv: string[]) => {
  const output: string[] = []
  const error: string[] = []
  const sink = (lines: string[]) =>
    new Writable({
      write: (chunk, _encoding, done) => {
        lines.push(String(chunk))
        done()
      },
    })
  const exitCode = await runNextSuite({
    argv,
    version: '2.0.0',
    cwd: root,
    output: sink(output),
    error: sink(error),
    remote: {
      fetch: async () => new Response('offline', { status: 503 }),
      cacheDir: join(root, 'cache'),
      tokenFor: () => undefined,
      npmRegistry: undefined,
    },
    userConfigPath: join(root, 'config.json'),
  })
  return { exitCode, output: output.join(''), error: ansis.strip(error.join('')) }
}

const config = async () => JSON.parse(await readFile(join(root, 'config.json'), 'utf8'))

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'next-suite-command-'))
  await write({
    'registry/registry.json': JSON.stringify({
      name: '@acme',
      plugins: [{ name: 'mail', path: 'mail', description: 'Sends mail.' }],
    }),
    'registry/mail/plugin.json': plugin('mail'),
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
    expect(result.error).toContain('./registry is the registry @acme, not @other')
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
    await write({
      'good/plugin.json': plugin('good', { files: [{ source: 'a.ts.hbs', target: 'a.ts' }] }),
      'good/a.ts.hbs': 'export const name = "{{project.name}}"\n',
      'bad/plugin.json': plugin('bad', { files: [{ source: 'a.ts.hbs', target: 'a.ts' }] }),
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
