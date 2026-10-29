import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { PassThrough, Writable } from 'node:stream'

import ansis from 'ansis'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { loadAssets } from './load-assets.ts'
import { runCreate } from './run-create.ts'

let root: string

const write = async (files: Record<string, string>): Promise<void> => {
  for (const [path, content] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true })
    await writeFile(join(root, path), content)
  }
}

const manifest = (name: string, extra: object = {}): string =>
  JSON.stringify({
    name,
    version: '1.0.0',
    engine: '^1.0.0',
    title: name,
    description: `The ${name} plugin.`,
    ...extra,
  })

const ASSETS = {
  'assets/categories.json': JSON.stringify([
    {
      id: 'package-manager',
      question: 'Which package manager?',
      cardinality: 'one',
      default: 'pnpm',
    },
    { id: 'orm', question: 'Which ORM?', cardinality: 'at-most-one', default: null },
  ]),
  'assets/catalog.json': JSON.stringify({ next: '16.4.3' }),
  'assets/base/plugin.json': manifest('base', {
    dependencies: { next: 'catalog:next' },
    contributes: { package: { scripts: { dev: 'next dev' } } },
    files: [{ source: 'files/page.tsx', target: 'app/page.tsx', root: 'source' }],
  }),
  'assets/base/files/page.tsx':
    'export default function Page() { return <h1>{{project.name}}</h1> }\n',
  'assets/plugins/pnpm/plugin.json': manifest('pnpm', { category: 'package-manager' }),
  'assets/plugins/npm/plugin.json': manifest('npm', { category: 'package-manager' }),
  'assets/plugins/drizzle/plugin.json': manifest('drizzle', {
    category: 'orm',
    dependencies: { 'drizzle-orm': '^1.0.0' },
    files: [{ source: 'db.ts', target: 'lib/db.ts', root: 'source' }],
  }),
  'assets/plugins/drizzle/db.ts': 'export const db = {}\n',
  'assets/plugins/better-auth/plugin.json': manifest('better-auth', {
    requires: [{ when: { category: 'orm' }, reason: 'Stores sessions in the database.' }],
  }),
}

type RunOptions = { isInteractive?: boolean; keys?: string[] }

const KEY_DELAY_MS = 40

const run = async (argv: string[], { isInteractive = false, keys = [] }: RunOptions = {}) => {
  const output: string[] = []
  const error: string[] = []
  const sink = (lines: string[]) =>
    new Writable({
      write: (chunk, _encoding, done) => {
        lines.push(String(chunk))
        done()
      },
    })
  const input = new PassThrough()
  const pressing = (async () => {
    for (const key of keys) {
      await new Promise((resolve) => setTimeout(resolve, KEY_DELAY_MS))
      input.write(key)
    }
  })()
  const exitCode = await runCreate({
    argv,
    assets: await loadAssets(join(root, 'assets')),
    cliVersion: '2.0.0',
    cwd: root,
    streams: { input, output: sink(output), error: sink(error) },
    isInteractive,
    columns: 80,
    now: () => new Date('2026-11-01T10:00:00Z'),
  })
  await pressing
  return { exitCode, output: ansis.strip(output.join('')), error: error.join('') }
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'next-suite-create-'))
  await write(ASSETS)
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('runCreate', () => {
  it('shows the plan of a quick start with --yes --dry-run and writes nothing', async () => {
    const result = await run(['my-app', '--yes', '--dry-run'])

    expect(result).toEqual({
      exitCode: 0,
      output: [
        'Files:',
        '  app/page.tsx (1 line, base)',
        '  next-suite.json (21 lines, create-next-suite)',
        '  package.json (10 lines, create-next-suite)',
        'Dependencies:',
        '  next 16.4.3',
        '',
      ].join('\n'),
      error: '',
    })
  })

  it('takes plugins and settings from flags', async () => {
    const result = await run(['my-app', '--yes', '--dry-run', '--orm', 'drizzle', '--src-dir'])

    expect(result.output).toContain('src/lib/db.ts (1 line, drizzle)')
    expect(result.output).toContain('drizzle-orm ^1.0.0')
  })

  it('writes the project', async () => {
    expect((await run(['my-app', '--yes'])).exitCode).toBe(0)

    expect(await readFile(join(root, 'my-app/app/page.tsx'), 'utf8')).toContain('<h1>my-app</h1>')
    expect(
      JSON.parse(await readFile(join(root, 'my-app/next-suite.json'), 'utf8')).answers,
    ).toMatchObject({
      'package-manager': 'pnpm',
    })
  })

  it('rebuilds the same project from the answers in next-suite.json', async () => {
    await run(['first', '--yes', '--orm', 'drizzle', '--no-better-auth'])
    const recorded = JSON.parse(await readFile(join(root, 'first/next-suite.json'), 'utf8')).answers
    await write({ 'answers.json': JSON.stringify(recorded) })

    const again = await run(['second', '--answers', 'answers.json', '--dry-run'])
    const original = await run([
      'first-again',
      '--yes',
      '--orm',
      'drizzle',
      '--no-better-auth',
      '--dry-run',
    ])

    expect(recorded).toEqual({
      'package-manager': 'pnpm',
      orm: 'drizzle',
      'better-auth': false,
      'src-dir': false,
      'import-alias': '@/*',
      'react-compiler': false,
      'cache-components': true,
    })
    expect(again).toEqual(original)
  })

  it('drops an answer of the file whose question a flag made obsolete', async () => {
    await write({ 'answers.json': JSON.stringify({ orm: 'drizzle', 'drizzle.casing': 'snake' }) })
    await write({
      'assets/plugins/drizzle/plugin.json': manifest('drizzle', {
        category: 'orm',
        options: {
          casing: {
            type: 'select',
            question: 'Casing?',
            choices: [{ value: 'snake', label: 'snake' }],
            default: 'snake',
          },
        },
      }),
    })

    const result = await run([
      'my-app',
      '--yes',
      '--answers',
      'answers.json',
      '--no-orm',
      '--dry-run',
    ])

    expect(result.exitCode).toBe(0)
  })

  it('reads answers from a file, which flags override', async () => {
    await write({
      'answers.json': JSON.stringify({
        'package-manager': 'npm',
        orm: 'drizzle',
        'better-auth': false,
        'src-dir': false,
        'import-alias': '@/*',
        'react-compiler': false,
        'cache-components': true,
      }),
    })

    const result = await run(['my-app', '--answers', 'answers.json', '--no-orm', '--dry-run'])

    expect(result.exitCode).toBe(0)
    expect(result.output).not.toContain('drizzle')
  })

  it('lists the missing answers without a terminal and without --yes', async () => {
    const result = await run(['my-app', '--dry-run', '--package-manager', 'npm'])

    expect(result.exitCode).toBe(1)
    expect(result.error).toContain('answers are missing')
    expect(result.error).toContain('  orm\n')
  })

  it('names the reason of an incompatible choice', async () => {
    const result = await run(['my-app', '--yes', '--better-auth', '--dry-run'])

    expect(result).toMatchObject({ exitCode: 1, output: '' })
    expect(result.error).toContain('better-auth: Stores sessions in the database.')
  })

  it('rejects an invalid project name', async () => {
    const result = await run(['My App', '--yes', '--dry-run'])

    expect(result.exitCode).toBe(1)
    expect(result.error).toContain('"My App" is no valid package name')
  })

  it('needs a project directory without a terminal and without --yes', async () => {
    const result = await run(['--dry-run'])

    expect(result.error).toContain('name the project directory')
  })

  it('rejects an answer that no question asks', async () => {
    await write({ 'answers.json': JSON.stringify({ colour: 'blue' }) })

    const result = await run(['my-app', '--yes', '--answers', 'answers.json', '--dry-run'])

    expect(result.error).toContain('these answers belong to no question that is asked: colour')
  })

  it('lists the plugin flags in --help', async () => {
    const result = await run(['--help'])

    expect(result.exitCode).toBe(0)
    expect(result.output).toContain('--orm <plugin>')
    expect(result.output).toContain('--no-orm')
    expect(result.output).toContain('--better-auth')
  })

  it('closes the wizard frame with the error of a failed guided run', async () => {
    const result = await run(['My App', '--dry-run'], { isInteractive: true })

    expect(result.exitCode).toBe(1)
    expect(ansis.strip(result.error)).toContain(
      '└  create-next-suite: "My App" is no valid package name',
    )
  })

  it('opens the wizard with the intro and the Project section, and ends a cancelled run cleanly', async () => {
    const result = await run(['--dry-run'], { isInteractive: true, keys: ['\u0003'] })

    expect(result.exitCode).toBe(130)
    expect(result.output).toContain("┌  Let's lay the foundation")
    expect(result.output).toContain('│   Project ')
    expect(result.output).toContain('└  Operation cancelled.')
  })

  it('takes the quick start and frames the dry run in the wizard', async () => {
    const enter = '\r'
    const result = await run(['my-app', '--dry-run'], {
      isInteractive: true,
      keys: [enter, 'y', enter],
    })

    expect(result.exitCode).toBe(0)
    expect(result.output).toContain('Use the quick start?')
    expect(result.output).toContain('│  Files:')
    expect(result.output).toContain('└  Dry run, nothing was written')
  })
})
