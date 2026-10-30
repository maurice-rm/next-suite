import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PassThrough } from 'node:stream'

import ansis from 'ansis'
import * as tar from 'tar'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { loadAssets } from '../loader/load-assets.ts'
import { collectOutput } from '../test-support/collect-output.ts'
import { type Routes, stubRemote } from '../test-support/stub-remote.ts'
import { testManifestJson } from '../test-support/test-manifest.ts'
import { writeFiles } from '../test-support/write-files.ts'
import { runCreate } from './run-create.ts'

let root: string

/** A GitHub tarball of a plugin folder, served for `github:acme/plugins/<name>` at commit 0123456789abcdef0123456789abcdef01234567. */
const githubRoutes = async (name: string, files: Record<string, string>) => {
  const top = join(root, 'github-source')
  await writeFiles(join(top, 'repo', name), files)
  const file = join(root, 'github.tgz')
  await tar.c({ gzip: true, file, cwd: top }, ['repo'])
  const archive = new Uint8Array(await readFile(file))
  await rm(top, { recursive: true, force: true })
  return {
    'https://api.github.com/repos/acme/plugins/commits/HEAD': () =>
      new Response('0123456789abcdef0123456789abcdef01234567'),
    'https://api.github.com/repos/acme/plugins/tarball/0123456789abcdef0123456789abcdef01234567':
      () => new Response(archive),
  }
}

const ASSETS = {
  'assets/categories.json': JSON.stringify([
    {
      section: 'Project',
      categories: [
        {
          id: 'package-manager',
          question: 'Which package manager?',
          cardinality: 'one',
          default: 'pnpm',
        },
      ],
    },
    {
      section: 'Data',
      categories: [
        { id: 'orm', question: 'Which ORM?', cardinality: 'at-most-one', default: null },
      ],
    },
  ]),
  'assets/catalog.json': JSON.stringify({ next: '16.4.3' }),
  'assets/base/plugin.json': testManifestJson('base', {
    dependencies: { next: 'catalog:next' },
    contributes: { package: { scripts: { dev: 'next dev' } } },
    files: [{ source: 'files/page.tsx.hbs', target: 'app/page.tsx', root: 'source' }],
  }),
  'assets/base/files/page.tsx.hbs':
    'export default function Page() { return <h1>{{project.name}}</h1> }\n',
  'assets/plugins/package-manager/pnpm/plugin.json': testManifestJson('pnpm', {
    category: 'package-manager',
    packageManager: {
      version: '12.16.1',
      ciInstallArgs: ['ci'],
      whenVersionDiffers: 'download',
      allowedBuildsIn: 'package.json#allowScripts',
    },
  }),
  'assets/plugins/package-manager/npm/plugin.json': testManifestJson('npm', {
    category: 'package-manager',
    packageManager: {
      version: '12.2.1',
      ciInstallArgs: ['ci'],
      whenVersionDiffers: 'warn',
      allowedBuildsIn: 'package.json#allowScripts',
    },
  }),
  'assets/plugins/orm/drizzle/plugin.json': testManifestJson('drizzle', {
    category: 'orm',
    dependencies: { 'drizzle-orm': '^1.0.0' },
    files: [{ source: 'db.ts', target: 'lib/db.ts', root: 'source' }],
  }),
  'assets/plugins/orm/drizzle/db.ts': 'export const db = {}\n',
  'assets/plugins/extras/better-auth/plugin.json': testManifestJson('better-auth', {
    requires: [{ when: { category: 'orm' }, reason: 'Stores sessions in the database.' }],
  }),
}

type RunOptions = {
  isInteractive?: boolean
  keys?: string[]
  userAgent?: string
  routes?: Routes
}

const OUTSIDE_REPOSITORY = 'git rev-parse --is-inside-work-tree'

const KEY_DELAY_MS = 40

const run = async (
  argv: string[],
  { isInteractive = false, keys = [], userAgent, routes = {} }: RunOptions = {},
) => {
  const commands: string[] = []
  const output = collectOutput()
  const error = collectOutput()
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
    streams: { input, output: output.stream, error: error.stream },
    isInteractive,
    columns: 80,
    now: () => new Date('2026-11-01T10:00:00Z'),
    userAgent,
    runCommand: async (command, args) => {
      const line = [command, ...args].join(' ')
      commands.push(line)
      return { isSuccess: line !== OUTSIDE_REPOSITORY, output: '' }
    },
    remote: stubRemote(root, routes),
    userConfigPath: join(root, 'config.json'),
    fetchLatestVersion: async () => undefined,
  })
  await pressing
  return {
    exitCode,
    output: ansis.strip(output.text()),
    error: ansis.strip(error.text()),
    commands,
  }
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'next-suite-create-'))
  await writeFiles(root, ASSETS)
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
    await rm(join(root, 'assets/base'), { recursive: true })

    const result = await run(['my-app', '--yes'])
    const withSetting = await run(['my-app', '--yes', '--src-dir'])

    expect(result).toEqual({
      exitCode: 0,
      output: 'Nothing generated yet: the base project is still missing\n',
      error: '',
      commands: [],
    })
    await expect(readFile(join(root, 'my-app/package.json'))).rejects.toThrow()
    expect(withSetting.error).toContain("unknown option '--src-dir'")
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
    const recorded = JSON.parse(await readFile(join(root, 'my-app/next-suite.json'), 'utf8'))

    expect(result.commands).toEqual([])
    expect(recorded.answers).not.toHaveProperty('install')
    expect(recorded.answers).not.toHaveProperty('git')
  })

  it('preselects the package manager that started it', async () => {
    const result = await run(['my-app', '--yes', '--no-git'], {
      userAgent: 'npm/12.2.1 node/v24.15.0 linux x64 workspaces/false',
    })
    const packageJson = JSON.parse(await readFile(join(root, 'my-app/package.json'), 'utf8'))

    expect(result.commands).toEqual(['npm --version', 'npm install'])
    expect(packageJson).toMatchObject({ packageManager: 'npm@12.2.1', allowScripts: {} })
  })

  it('rebuilds the same project from the answers in next-suite.json', async () => {
    await run(['first', '--yes', '--orm', 'drizzle', '--no-better-auth'])
    const recorded = JSON.parse(await readFile(join(root, 'first/next-suite.json'), 'utf8')).answers
    await writeFiles(root, { 'answers.json': JSON.stringify(recorded) })

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
    await writeFiles(root, {
      'answers.json': JSON.stringify({ orm: 'drizzle', 'drizzle.casing': 'snake' }),
    })
    await writeFiles(root, {
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
    await writeFiles(root, {
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

  it('creates the project in a path, named after its last folder', async () => {
    expect((await run(['apps/web-shop', '--yes', '--no-git', '--no-install'])).exitCode).toBe(0)

    expect(JSON.parse(await readFile(join(root, 'apps/web-shop/package.json'), 'utf8')).name).toBe(
      'web-shop',
    )
  })

  it('asks for --overwrite or --empty for a folder with files without a terminal', async () => {
    await writeFiles(root, { 'shop/notes.txt': 'mine' })

    const result = await run(['shop', '--yes'])

    expect(result.exitCode).toBe(1)
    expect(result.error).toContain(
      '"shop" already has conflicting files — pass --overwrite or --empty to proceed.',
    )
    expect(result.commands).toEqual([])
  })

  it('keeps the other files with --overwrite and deletes them with --empty', async () => {
    await writeFiles(root, { 'kept/notes.txt': 'mine', 'emptied/notes.txt': 'mine' })

    await run(['kept', '--yes', '--overwrite', '--no-git', '--no-install'])
    await run(['emptied', '--yes', '--empty', '--no-git', '--no-install'])

    expect(await readFile(join(root, 'kept/notes.txt'), 'utf8')).toBe('mine')
    await expect(readFile(join(root, 'emptied/notes.txt'))).rejects.toThrow()
    expect(await readFile(join(root, 'emptied/package.json'), 'utf8')).toContain('"emptied"')
  })

  it('rejects --overwrite together with --empty', async () => {
    const result = await run(['shop', '--yes', '--overwrite', '--empty'])

    expect(result.error).toContain("option '--overwrite' cannot be used with option '--empty'")
  })

  it('asks in the wizard what to do with a folder that has files', async () => {
    await writeFiles(root, { 'shop/notes.txt': 'mine' })

    const result = await run(['shop', '--dry-run'], { isInteractive: true, keys: ['\u0003'] })

    expect(result.output).toContain(
      '"shop" exists and is not empty. How would you like to proceed?',
    )
    expect(result.output).toContain('Empty the directory — delete everything except .git')
    expect(result.output).toContain('Continue (keep existing files)')
  })

  it('rejects an invalid project name', async () => {
    const result = await run(['My App', '--yes', '--dry-run'])

    expect(result.exitCode).toBe(1)
    expect(result.error).toContain('"My App" is no valid package name')
  })

  it('needs a project name without a terminal, also with --yes', async () => {
    expect((await run(['--dry-run'])).error).toContain(
      'A project name is required without a terminal',
    )
    expect((await run(['--yes', '--dry-run'])).error).toContain(
      'A project name is required in --yes mode — pass it as the argument.',
    )
  })

  it('adds a plugin from a local folder, with its flag, its files and its source', async () => {
    await writeFiles(root, {
      'mail/plugin.json': testManifestJson('mail', {
        section: 'Integrations',
        files: [{ source: 'mail.ts', target: 'lib/mail.ts' }],
      }),
      'mail/mail.ts': 'export const mail = true\n',
    })

    const help = await run(['--plugin', './mail', '--help'])
    const result = await run(['my-app', '--yes', '--plugin', './mail', '--mail', '--no-git'])
    const recorded = JSON.parse(await readFile(join(root, 'my-app/next-suite.json'), 'utf8'))

    expect(help.output).toContain('--mail')
    expect(result.exitCode).toBe(0)
    expect(await readFile(join(root, 'my-app/lib/mail.ts'), 'utf8')).toBe(
      'export const mail = true\n',
    )
    expect(recorded.plugins).toContainEqual({ name: 'mail', source: './mail', version: '1.0.0' })
    expect(recorded.answers).toMatchObject({ mail: true })
  })

  it('rejects an external plugin with the name of a built-in one, and an unknown address', async () => {
    await writeFiles(root, { 'npm/plugin.json': testManifestJson('npm') })

    expect((await run(['my-app', '--yes', '--plugin', './npm'])).error).toContain(
      'two plugins are named npm',
    )
    expect((await run(['my-app', '--yes', '--plugin', 'mail'])).error).toContain(
      'the address has no known form',
    )
  })

  it('runs the logic module of a plugin: computed files, contributions and dependencies', async () => {
    await writeFiles(root, {
      'hello/plugin.json': testManifestJson('hello', {
        logic: 'logic.ts',
        selectedByDefault: true,
      }),
      'hello/logic.ts': [
        'export default (context) => ({',
        '  files: [{ target: "lib/hello.ts", content: "export const name = " + JSON.stringify(context.project.name) + "\\n" }],',
        '  contributes: { gitignore: ["/hello-cache"], stack: ["Hello"] },',
        '  devDependencies: { zod: "4.6.7" },',
        '})',
        '',
      ].join('\n'),
    })

    const result = await run(['my-app', '--yes', '--plugin', './hello', '--dry-run', '--diff'])

    expect(result.exitCode).toBe(0)
    expect(result.output).toContain('lib/hello.ts (1 line, hello)')
    expect(result.output).toContain('+export const name = "my-app"')
    expect(result.output).toContain('zod 4.6.7')
  })

  it('rejects a logic module that answers something invalid', async () => {
    await writeFiles(root, {
      'broken/plugin.json': testManifestJson('broken', {
        logic: 'logic.ts',
        selectedByDefault: true,
      }),
      'broken/logic.ts': 'export default () => ({ files: "nope" })\n',
    })

    const result = await run(['my-app', '--yes', '--plugin', './broken', '--dry-run'])

    expect(result.exitCode).toBe(1)
    expect(result.error).toContain('broken: its logic answers something invalid')
  })

  it('needs trust for a plugin from GitHub even without a logic module, since it writes and runs', async () => {
    const routes = await githubRoutes('mail', {
      'plugin.json': testManifestJson('mail', { selectedByDefault: true }),
    })

    const argv = ['my-app', '--yes', '--no-git', '--plugin', 'github:acme/plugins/mail']
    const refused = await run(argv, { routes })
    const result = await run([...argv, '--trust', 'github:acme/*'], { routes })
    const recorded = JSON.parse(await readFile(join(root, 'my-app/next-suite.json'), 'utf8'))

    expect(refused.error).toContain('comes from an untrusted source')
    expect(result.exitCode).toBe(0)
    expect(recorded.plugins).toContainEqual({
      name: 'mail',
      source: 'github:acme/plugins/mail',
      resolved: '0123456789abcdef0123456789abcdef01234567',
      version: '1.0.0',
    })
  })

  it('runs code from an untrusted source only with --trust or a trusted pattern', async () => {
    const routes = await githubRoutes('hello', {
      'plugin.json': testManifestJson('hello', { logic: 'logic.ts', selectedByDefault: true }),
      'logic.ts': 'export default () => ({ files: [{ target: "hello.txt", content: "hi\\n" }] })\n',
    })
    const argv = ['my-app', '--yes', '--dry-run', '--plugin', 'github:acme/plugins/hello']

    const refused = await run(argv, { routes })
    const flagged = await run([...argv, '--trust', 'github:acme/*'], { routes })
    await writeFiles(root, { 'config.json': JSON.stringify({ trust: ['github:acme/plugins/*'] }) })
    const configured = await run(argv, { routes })

    expect(refused.exitCode).toBe(1)
    expect(refused.error).toContain('comes from an untrusted source; pass --trust')
    expect(flagged.output).toContain('hello.txt (1 line, hello)')
    expect(configured.output).toContain('hello.txt (1 line, hello)')
  })

  it('asks in the terminal and remembers a source the user always trusts', async () => {
    const routes = await githubRoutes('hello', {
      'plugin.json': testManifestJson('hello', { logic: 'logic.ts', selectedByDefault: true }),
      'logic.ts': 'export default () => ({})\n',
    })
    const up = '\u001b[A'
    const enter = '\r'

    const result = await run(['my-app', '--dry-run', '--plugin', 'github:acme/plugins/hello'], {
      isInteractive: true,
      routes,
      keys: [enter, 'y', up, enter],
    })

    expect(result.output).toContain('can run code on your machine. Use it?')
    expect(JSON.parse(await readFile(join(root, 'config.json'), 'utf8')).trust).toEqual([
      'github:acme/plugins/hello',
    ])
  })

  it('loads a plugin of a registry by its short name', async () => {
    await writeFiles(root, {
      'registry/registry.json': JSON.stringify({
        name: '@acme',
        plugins: [{ name: 'mail', path: 'plugins/mail', description: 'Mail.' }],
      }),
      'registry/plugins/mail/plugin.json': testManifestJson('mail', { selectedByDefault: true }),
      'config.json': JSON.stringify({ trust: ['@acme/*'], registries: { '@acme': './registry' } }),
    })

    const result = await run(['my-app', '--yes', '--no-git', '--plugin', '@acme/mail'])
    const recorded = JSON.parse(await readFile(join(root, 'my-app/next-suite.json'), 'utf8'))

    expect(result.exitCode).toBe(0)
    expect(recorded.plugins).toContainEqual({
      name: 'mail',
      source: '@acme/mail',
      version: '1.0.0',
    })
  })

  it('rejects an answer that no question asks', async () => {
    await writeFiles(root, { 'answers.json': JSON.stringify({ colour: 'blue' }) })

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

  it('closes the wizard frame with the error of a failed guided run', async () => {
    const result = await run(['My App', '--dry-run'], { isInteractive: true })

    expect(result.exitCode).toBe(1)
    expect(result.error).toContain('└  create-next-suite: "My App" is no valid package name')
  })

  it('opens the wizard with the intro and the Project section, and ends a cancelled run cleanly', async () => {
    const result = await run(['--dry-run'], { isInteractive: true, keys: ['\u0003'] })

    expect(result.exitCode).toBe(130)
    expect(result.output).toContain("┌  Let's lay the foundation")
    expect(result.output).toContain('│   Project ')
    expect(result.output).toContain('└  Operation cancelled.')
  })

  it('marks the detected package manager and shows no package manager descriptions', async () => {
    const result = await run(['my-app', '--dry-run'], {
      isInteractive: true,
      keys: ['\u0003'],
      userAgent: 'npm/12.2.1 node/v24.15.0 linux x64 workspaces/false',
    })

    expect(result.output).toContain('npm (detected)')
    expect(result.output).not.toContain('The pnpm plugin.')
    expect(result.output).not.toContain('The npm plugin.')
  })

  it('asks no base settings in the wizard, only git and install after the plugins', async () => {
    const enter = '\r'
    const result = await run(['my-app', '--dry-run', '--no-better-auth', '--no-orm'], {
      isInteractive: true,
      keys: [enter, 'n', 'y', 'y'],
    })

    expect(result.exitCode).toBe(0)
    expect(result.output).not.toContain('src/ directory')
    expect(result.output.indexOf('Initialize a git repository?')).toBeLessThan(
      result.output.indexOf('Install dependencies?'),
    )
  })

  it('takes the quick start and frames the dry run in the wizard', async () => {
    const enter = '\r'
    const result = await run(['my-app', '--dry-run'], {
      isInteractive: true,
      keys: [enter, 'y', enter],
    })

    expect(result.exitCode).toBe(0)
    expect(result.output).toContain('Quick start with recommended defaults?')
    expect(result.output).toContain('│  Files:')
    expect(result.output).toContain('└  Dry run, nothing was written')
  })
})
