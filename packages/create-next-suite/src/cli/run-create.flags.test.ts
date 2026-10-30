import { readFile } from 'node:fs/promises'

import { describe, expect, it } from 'vitest'

import { readJson } from '../test-support/read-json.ts'
import { setUpCreateRuns } from '../test-support/run-create-harness.ts'

const { run, pathOf, write } = setUpCreateRuns()

/** Every category but the package manager left empty: the base project and a package manager. */
const BARE_ANSWERS = {
  styling: [],
  linter: null,
  formatter: null,
  'unused-code': null,
  'git-hooks': null,
  'unit-tests': null,
  'env-validation': null,
  logging: null,
  'security-headers': null,
  seo: null,
  ci: null,
  agents: null,
}

const runBare = async (flags: string[]) => {
  await write({ 'bare.json': JSON.stringify(BARE_ANSWERS) })
  return run(['my-app', '--answers', pathOf('bare.json'), ...flags])
}

describe('runCreate with flags and answer files', () => {
  it('shows the plan of a quick start with --yes --dry-run and writes nothing', async () => {
    const result = await run(['my-app', '--yes', '--dry-run'])

    expect(result).toMatchObject({ exitCode: 0, error: '', commands: [] })
    expect(result.output).toMatch(/^Files:\n/)
    expect(result.output).toContain('  package.json (')
    expect(result.output).toContain('  next-suite.json (')
    expect(result.output).toContain('Dev dependencies:')
    await expect(readFile(pathOf('my-app/package.json'))).rejects.toThrow()
  })

  it('takes plugins and settings from flags', async () => {
    const result = await runBare(['--yes', '--dry-run', '--linter', 'biome', '--src-dir'])

    expect(result.output).toContain('  biome.json (')
    expect(result.output).toContain('  src/app/page.tsx (')
  })

  it('writes the project', async () => {
    expect((await run(['my-app', '--yes'])).exitCode).toBe(0)

    expect(await readFile(pathOf('my-app/app/page.tsx'), 'utf8')).toContain('my-app')
    expect((await readJson(pathOf('my-app/next-suite.json'))).answers).toMatchObject({
      'package-manager': 'pnpm',
    })
  })

  it('initializes git, installs, commits and shows the next steps after writing', async () => {
    const result = await runBare(['--yes'])

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
        '  pnpm run dev',
        '',
      ].join('\n'),
    )
  })

  it('skips the install and git with --no-install and --no-git, and records neither', async () => {
    const result = await runBare(['--yes', '--no-install', '--no-git'])
    const recorded = await readJson(pathOf('my-app/next-suite.json'))

    expect(result.commands).toEqual([])
    expect(recorded.answers).not.toHaveProperty('install')
    expect(recorded.answers).not.toHaveProperty('git')
  })

  it('installs with the arguments of the package manager', async () => {
    const result = await runBare(['--yes', '--package-manager', 'yarn'])

    expect(result.error).toBe('')
    expect(result.commands).toContain('yarn install --no-immutable')
    expect(result.output).toContain('my-app is ready')
  })

  it('preselects the package manager that started it', async () => {
    await write({ 'bare.json': JSON.stringify(BARE_ANSWERS) })

    const result = await run(['my-app', '--yes', '--no-git', '--answers', pathOf('bare.json')], {
      userAgent: 'npm/12.2.1 node/v24.15.0 linux x64 workspaces/false',
    })
    const packageJson = await readJson(pathOf('my-app/package.json'))

    expect(result.commands).toEqual(['npm --version', 'npm install'])
    expect(packageJson.packageManager).toMatch(/^npm@/)
  })

  it('rebuilds the same project from the answers in next-suite.json', async () => {
    await run(['first', '--yes', '--linter', 'biome', '--no-ci'])
    const recorded = (await readJson(pathOf('first/next-suite.json'))).answers
    await write({ 'answers.json': JSON.stringify(recorded) })

    const again = await run(['first-again', '--answers', 'answers.json', '--dry-run'])
    const original = await run([
      'first-again',
      '--yes',
      '--linter',
      'biome',
      '--no-ci',
      '--dry-run',
    ])

    expect(recorded).toMatchObject({ linter: 'biome', formatter: null, ci: null, 'src-dir': false })
    expect(again).toEqual(original)
  })

  it('reads answers from a file, which flags override', async () => {
    await write({
      'answers.json': JSON.stringify({ ...BARE_ANSWERS, linter: 'eslint' }),
    })

    const result = await run([
      'my-app',
      '--yes',
      '--answers',
      'answers.json',
      '--no-linter',
      '--dry-run',
    ])

    expect(result.exitCode).toBe(0)
    expect(result.output).not.toContain('eslint')
  })

  it('lists the missing answers without a terminal and without --yes', async () => {
    const result = await run(['my-app', '--dry-run', '--package-manager', 'npm'])

    expect(result.exitCode).toBe(1)
    expect(result.error).toContain('answers are missing')
    expect(result.error).toContain('  linter\n')
  })

  it('names the reason of an incompatible choice', async () => {
    const result = await run([
      'my-app',
      '--yes',
      '--linter',
      'biome',
      '--formatter',
      'prettier',
      '--dry-run',
    ])

    expect(result).toMatchObject({ exitCode: 1, output: '' })
    expect(result.error).toContain('Prettier: Biome formats the code already.')
  })

  it('leaves out lint-staged by default without a linter or a formatter', async () => {
    const result = await run(['my-app', '--yes', '--dry-run', '--no-linter', '--no-formatter'])

    expect(result).toMatchObject({ exitCode: 0, error: '' })
    expect(result.output).not.toContain('lint-staged')
  })

  it('stops with the reason of lint-staged when it is chosen without a linter or a formatter', async () => {
    const result = await run([
      'my-app',
      '--yes',
      '--dry-run',
      '--no-linter',
      '--no-formatter',
      '--git-hooks',
      'lint-staged',
    ])

    expect(result.exitCode).toBe(1)
    expect(result.error).toContain(
      'the answers do not fit together:\nlint-staged with Husky: it needs a linter or a formatter to run on the staged files',
    )
  })

  it('refuses plugins from addresses in this version', async () => {
    const result = await run(['my-app', '--yes', '--dry-run', '--plugin', './mail'])

    expect(result.exitCode).toBe(1)
    expect(result.error).toContain(
      'create-next-suite: --plugin cannot be used: plugins from outside create-next-suite are moving to the plugin.ts form',
    )
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

  it('rejects an invalid project name and an invalid import alias', async () => {
    const name = await run(['My App', '--yes', '--dry-run'])
    const alias = await run(['my-app', '--yes', '--dry-run', '--import-alias', '@'])

    expect(name.exitCode).toBe(1)
    expect(name.error).toContain('"My App" is not a valid package name')
    expect(alias.error).toContain('the import alias "@" is invalid')
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
    expect(result.output).toContain('--linter <plugin>')
    expect(result.output).toContain('--no-linter')
    expect(result.output).toContain('--styling <plugins>')
  })

  it('reports a missing answer file plainly, before any wizard frame opens', async () => {
    const result = await run(['my-app', '--answers', 'missing.json', '--dry-run'], {
      isInteractive: true,
    })

    expect(result.exitCode).toBe(1)
    expect(result.output).toBe('')
    expect(result.error).toMatch(/^create-next-suite: cannot read the answer file/)
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
