import { readFile, rm } from 'node:fs/promises'

import { describe, expect, it } from 'vitest'

import { readJson } from '../test-support/read-json.ts'
import { setUpCreateRuns } from '../test-support/run-create-harness.ts'
import { testManifestJson } from '../test-support/test-manifest.ts'

const { run, pathOf, write } = setUpCreateRuns()

describe('runCreate with flags and answer files', () => {
  it('shows the plan of a quick start with --yes --dry-run and writes nothing', async () => {
    const result = await run(['my-app', '--yes', '--dry-run'])

    expect(result).toEqual({
      exitCode: 0,
      output: [
        'Files:',
        '  app/page.tsx (1 line, base)',
        '  next-suite.json (21 lines, create-next-suite)',
        '  package.json (19 lines, create-next-suite)',
        'Dependencies:',
        '  next 16.4.3',
        '',
      ].join('\n'),
      error: '',
      commands: [],
    })
  })

  it('asks only the plugin questions and generates nothing without a base project', async () => {
    await rm(pathOf('assets/base'), { recursive: true })

    const result = await run(['my-app', '--yes'])
    const withSetting = await run(['my-app', '--yes', '--src-dir'])

    expect(result).toEqual({
      exitCode: 0,
      output: 'Nothing generated yet: the base project is still missing\n',
      error: '',
      commands: [],
    })
    await expect(readFile(pathOf('my-app/package.json'))).rejects.toThrow()
    expect(withSetting.error).toContain("unknown option '--src-dir'")
  })

  it('takes plugins and settings from flags', async () => {
    const result = await run(['my-app', '--yes', '--dry-run', '--orm', 'drizzle', '--src-dir'])

    expect(result.output).toContain('src/lib/db.ts (1 line, drizzle)')
    expect(result.output).toContain('drizzle-orm ^1.0.0')
  })

  it('writes the project', async () => {
    expect((await run(['my-app', '--yes'])).exitCode).toBe(0)

    expect(await readFile(pathOf('my-app/app/page.tsx'), 'utf8')).toContain('<h1>my-app</h1>')
    expect((await readJson(pathOf('my-app/next-suite.json'))).answers).toMatchObject({
      'package-manager': 'pnpm',
    })
  })

  it('initializes git, installs, commits and shows the next steps after writing', async () => {
    const result = await run(['my-app', '--yes'])

    expect(result.commands).toEqual([
      'git rev-parse --is-inside-work-tree',
      'git --version',
      'git init --initial-branch main',
      'pnpm --version',
      'pnpm install',
      'git add --all',
      'git config user.email',
      'git -c user.name=create-next-suite -c user.email=create-next-suite@users.noreply.github.com commit --no-verify --message chore: initial commit',
    ])
    expect(result.output).toBe(
      [
        'Initialized git repository',
        'Installed dependencies',
        'Created initial commit',
        'my-app is ready',
        'Next steps:',
        '  cd my-app',
        '',
      ].join('\n'),
    )
  })

  it('skips the install and git with --no-install and --no-git, and records neither', async () => {
    const result = await run(['my-app', '--yes', '--no-install', '--no-git'])
    const recorded = await readJson(pathOf('my-app/next-suite.json'))

    expect(result.commands).toEqual([])
    expect(recorded.answers).not.toHaveProperty('install')
    expect(recorded.answers).not.toHaveProperty('git')
  })

  it('preselects the package manager that started it', async () => {
    const result = await run(['my-app', '--yes', '--no-git'], {
      userAgent: 'npm/12.2.1 node/v24.15.0 linux x64 workspaces/false',
    })
    const packageJson = await readJson(pathOf('my-app/package.json'))

    expect(result.commands).toEqual(['npm --version', 'npm install'])
    expect(packageJson).toMatchObject({ packageManager: 'npm@12.2.1', allowScripts: {} })
  })

  it('rebuilds the same project from the answers in next-suite.json', async () => {
    await run(['first', '--yes', '--orm', 'drizzle', '--no-better-auth'])
    const recorded = (await readJson(pathOf('first/next-suite.json'))).answers
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
    await write({
      'answers.json': JSON.stringify({ orm: 'drizzle', 'drizzle.casing': 'snake' }),
    })
    await write({
      'assets/plugins/orm/drizzle/plugin.json': testManifestJson('drizzle', {
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

  it('creates the project in a path, named after its last directory', async () => {
    expect((await run(['apps/web-shop', '--yes', '--no-git', '--no-install'])).exitCode).toBe(0)

    expect((await readJson(pathOf('apps/web-shop/package.json'))).name).toBe('web-shop')
  })

  it('asks for --overwrite or --empty for a directory with files without a terminal', async () => {
    await write({ 'shop/notes.txt': 'mine' })

    const result = await run(['shop', '--yes'])

    expect(result.exitCode).toBe(1)
    expect(result.error).toContain('"shop" is not empty — pass --overwrite or --empty to proceed')
    expect(result.commands).toEqual([])
  })

  it('keeps the other files with --overwrite and deletes them with --empty', async () => {
    await write({ 'kept/notes.txt': 'mine', 'emptied/notes.txt': 'mine' })

    await run(['kept', '--yes', '--overwrite', '--no-git', '--no-install'])
    await run(['emptied', '--yes', '--empty', '--no-git', '--no-install'])

    expect(await readFile(pathOf('kept/notes.txt'), 'utf8')).toBe('mine')
    await expect(readFile(pathOf('emptied/notes.txt'))).rejects.toThrow()
    expect(await readFile(pathOf('emptied/package.json'), 'utf8')).toContain('"emptied"')
  })

  it('rejects --overwrite together with --empty', async () => {
    const result = await run(['shop', '--yes', '--overwrite', '--empty'])

    expect(result.error).toContain("option '--overwrite' cannot be used with option '--empty'")
  })

  it('rejects an invalid project name', async () => {
    const result = await run(['My App', '--yes', '--dry-run'])

    expect(result.exitCode).toBe(1)
    expect(result.error).toContain('"My App" is not a valid package name')
  })

  it('needs a project name without a terminal, also with --yes', async () => {
    expect((await run(['--dry-run'])).error).toContain(
      'a project name is required without a terminal',
    )
    expect((await run(['--yes', '--dry-run'])).error).toContain(
      'a project name is required in --yes mode — pass it as the argument',
    )
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

  it('reports a missing answer file plainly, before any wizard frame opens', async () => {
    const result = await run(['my-app', '--answers', 'missing.json', '--dry-run'], {
      isInteractive: true,
    })

    expect(result.exitCode).toBe(1)
    expect(result.output).toBe('')
    expect(result.error).toMatch(/^create-next-suite: cannot read the answer file/)
  })

  it('reports invalid package assets like any expected failure', async () => {
    await write({ 'assets/catalog.json': '{' })

    const result = await run(['my-app', '--yes', '--dry-run'])

    expect(result.exitCode).toBe(1)
    expect(result.error).toMatch(/^create-next-suite: .*catalog\.json is not valid JSON/)
  })

  it('asks to report an unexpected error instead of crashing', async () => {
    const result = await run(['my-app', '--yes'], {
      runCommand: async () => {
        throw new Error('the runner broke')
      },
    })

    expect(result.exitCode).toBe(1)
    expect(result.error).toContain('create-next-suite: unexpected error, please report it at')
    expect(result.error).toContain('Error: the runner broke')
  })
})
