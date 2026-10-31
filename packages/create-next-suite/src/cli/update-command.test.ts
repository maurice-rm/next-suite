import { existsSync } from 'node:fs'
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { hashFileContent, parseLockFile, renderLockFile } from '../project-config/lock-file.ts'
import { PROJECT_PATHS } from '../project-config/project-paths.ts'
import { commitAll, git, initRepository } from '../test-support/git.ts'
import { setUpCreateRuns } from '../test-support/run-create-harness.ts'
import { runNextSuiteIn } from '../test-support/run-next-suite-harness.ts'
import type { NextSuiteEnvironment } from './next-suite-environment.ts'

const { run: create, pathOf, write } = setUpCreateRuns()

const PROJECT = 'my-app'
const QUIET = ['--yes', '--no-ci', '--no-git', '--no-install']

const read = (path: string) => readFile(pathOf(join(PROJECT, path)), 'utf8')

const writeProjectFile = (path: string, content: string) =>
  writeFile(pathOf(join(PROJECT, path)), content)

/** Replaces the first occurrence of a text in a file of the project, which must hold it. */
const replaceIn = async (path: string, search: string, replacement: string) => {
  const content = await read(path)
  expect(content).toContain(search)
  await writeProjectFile(path, content.replace(search, replacement))
}

const update = (argv: string[] = [], overrides: Partial<NextSuiteEnvironment> = {}) =>
  runNextSuiteIn({ root: pathOf('.'), cwd: pathOf(PROJECT) }, ['update', ...argv], overrides)

/** Creates the project and commits it, as create does by default. */
const createProject = async (flags: string[] = []) => {
  const created = await create([PROJECT, ...QUIET, ...flags])
  expect(created.error).toBe('')
  initRepository(pathOf(PROJECT))
  commitAll(pathOf(PROJECT), 'chore: initial commit')
}

const status = () => git(pathOf(PROJECT), ['status', '--porcelain'])

describe('next-suite update', () => {
  it('takes a change of the config into the files and keeps your edits', async () => {
    await createProject(['--no-logging'])
    await replaceIn(
      'app/layout.tsx',
      '      <body>\n',
      '      <body>\n        <header>Plants</header>\n',
    )
    await replaceIn('app/page.tsx', 'Get started by editing', 'Welcome to my blog. Edit')
    await replaceIn(
      'package.json',
      '"dev": "next dev",',
      '"dev": "next dev",\n    "studio": "drizzle-kit studio",',
    )
    commitAll(pathOf(PROJECT), 'feat: header, welcome text, studio')
    await replaceIn('next-suite.config.ts', '    "t3-env",\n', '    "t3-env",\n    "pino",\n')
    await replaceIn('next-suite.config.ts', 'disable: []', 'disable: ["seo"]')

    const result = await update()

    expect(result).toMatchObject({ exitCode: 0, error: '' })
    expect(result.output).toContain('Merged with your changes:\n  app/layout.tsx\n  package.json\n')
    expect(result.output).toContain('Added:\n  lib/logger.ts\n')
    expect(result.output).toContain(
      'Removed:\n  app/robots.ts\n  app/sitemap.ts\n  lib/site-url.ts\n',
    )
    expect(result.output).toContain('Updated the project and .next-suite/lock.json.')
    const layout = await read('app/layout.tsx')
    expect(layout).toContain('<header>Plants</header>')
    expect(layout).not.toContain('metadataBase')
    expect(await read('app/page.tsx')).toContain('Welcome to my blog.')
    const packageJson = JSON.parse(await read('package.json'))
    expect(packageJson.scripts.studio).toBe('drizzle-kit studio')
    expect(packageJson.dependencies.pino).toBeDefined()
    expect(existsSync(pathOf(`${PROJECT}/app/robots.ts`))).toBe(false)
    const lock = parseLockFile(await read(PROJECT_PATHS.lock), PROJECT_PATHS.lock)
    expect(lock.plugins.map(({ name }) => name)).toContain('pino')
    expect(lock.disable).toEqual(['seo'])
    expect(lock.files['lib/logger.ts']).toBe(hashFileContent(await read('lib/logger.ts')))
  })

  it('keeps what the devDependency on create-next-suite names', async () => {
    const created = await create([PROJECT, ...QUIET, '--no-logging'], {
      cliSpecifier: 'file:../create-next-suite.tgz',
    })
    expect(created.error).toBe('')
    initRepository(pathOf(PROJECT))
    commitAll(pathOf(PROJECT), 'chore: initial commit')
    await replaceIn('next-suite.config.ts', '    "t3-env",\n', '    "t3-env",\n    "pino",\n')

    const result = await update()

    expect(result).toMatchObject({ exitCode: 0, error: '' })
    expect(result.output).not.toContain('Warning')
    const packageJson = JSON.parse(await read('package.json'))
    expect(packageJson.devDependencies['create-next-suite']).toBe('file:../create-next-suite.tgz')
    expect(packageJson.dependencies.pino).toBeDefined()
  })

  it('reports nothing to update for an unchanged config and changes no file', async () => {
    await createProject()

    const result = await update()

    expect(result.output).toBe('No file to update; .next-suite/lock.json is current.\n')
    expect(status()).toBe('')
  })

  it('refuses uncommitted changes outside the config and next-suite/, unless forced', async () => {
    await createProject()
    await replaceIn('app/page.tsx', 'Get started', 'Work in progress')

    const refused = await update()
    const forced = await update(['--force'])

    expect(refused.exitCode).toBe(1)
    expect(refused.error).toContain(
      'commit or stash your changes first, or pass --force: app/page.tsx',
    )
    expect(forced.exitCode).toBe(0)
    expect(forced.output).toMatch(
      /Note: your uncommitted changes to tracked files are saved in [0-9a-f]{40}/,
    )
  })

  it('shows what it would do in a dry run and writes nothing', async () => {
    await createProject()
    await replaceIn('next-suite.config.ts', 'disable: []', 'disable: ["seo"]')
    const before = status()

    const result = await update(['--dry-run'])

    expect(result.exitCode).toBe(0)
    expect(result.output).toContain('Removed:\n  app/robots.ts\n')
    expect(result.output).toContain('Dry run, nothing was written.')
    expect(status()).toBe(before)
  })

  it('marks a merge conflict, waits for --continue and records the update once it is resolved', async () => {
    await createProject()
    await replaceIn('next.config.ts', 'cacheComponents: true,', 'cacheComponents: true, // mine')
    commitAll(pathOf(PROJECT), 'chore: my comment')
    await replaceIn('next-suite.config.ts', 'cacheComponents: true', 'cacheComponents: false')
    const lockBefore = await read(PROJECT_PATHS.lock)

    const conflicted = await update()

    expect(conflicted.exitCode).toBe(1)
    expect(conflicted.output).toContain(
      'Merge conflicts:\n  next.config.ts: 1 merge conflict, between <<<<<<< yours and >>>>>>> next-suite',
    )
    expect(conflicted.error).toContain(
      '1 file has merge conflicts; resolve them, then run `next-suite update --continue`',
    )
    expect(await read('next.config.ts')).toContain(
      '<<<<<<< yours\n  cacheComponents: true, // mine\n',
    )
    expect(await read(PROJECT_PATHS.lock)).toBe(lockBefore)
    expect(existsSync(pathOf(`${PROJECT}/${PROJECT_PATHS.pendingUpdate}`))).toBe(true)

    const again = await update()
    const unresolved = await update(['--continue'])

    expect(again.error).toContain('an update waits for its merge conflicts to be resolved')
    expect(unresolved.exitCode).toBe(1)
    expect(unresolved.error).toContain(
      'still hold merge conflict markers; resolve them, then run `next-suite update --continue` again: next.config.ts',
    )

    const merged = await read('next.config.ts')
    await writeProjectFile(
      'next.config.ts',
      merged.replace(
        /<<<<<<< yours\n[\s\S]*?>>>>>>> next-suite\n/,
        '  cacheComponents: false, // mine\n',
      ),
    )
    const continued = await update(['--continue'])

    expect(continued).toMatchObject({
      exitCode: 0,
      output: 'Recorded the update in .next-suite/lock.json.\n',
    })
    expect(
      parseLockFile(await read(PROJECT_PATHS.lock), PROJECT_PATHS.lock).project.cacheComponents,
    ).toBe(false)
    expect(existsSync(pathOf(`${PROJECT}/${PROJECT_PATHS.pendingUpdate}`))).toBe(false)
  })

  it('reports a key of package.json both sides changed with both values and keeps yours', async () => {
    await createProject()
    await replaceIn('package.json', '"lint": "eslint",', '"lint": "eslint --cache",')
    commitAll(pathOf(PROJECT), 'chore: cache lint')
    await replaceIn('next-suite.config.ts', '"eslint",\n    "prettier",', '"biome",')

    const result = await update()

    expect(result.exitCode).toBe(1)
    expect(result.output).toContain(
      'package.json: your value is kept where next-suite changed it too\n    scripts.lint: yours "eslint --cache", next-suite "biome check"',
    )
    expect(JSON.parse(await read('package.json')).scripts.lint).toBe('eslint --cache')
  })

  it('applies overrides and project plugins', async () => {
    await createProject()
    await write({
      [`${PROJECT}/next-suite/overrides/app/not-found.tsx`]:
        'export default function NotFound() {}\n',
      [`${PROJECT}/next-suite/plugins/greeting/plugin.ts`]: [
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
      [`${PROJECT}/next-suite/plugins/greeting/files/greeting.ts`]:
        'export const tone = "friendly"\n',
    })
    await replaceIn(
      'next-suite.config.ts',
      '    "agents-md",\n',
      '    "agents-md",\n    "./next-suite/plugins/greeting",\n',
    )
    await replaceIn(
      'next-suite.config.ts',
      'answers: {}',
      'answers: { greeting: { tone: "formal" } }',
    )

    const result = await update()

    expect(result).toMatchObject({ exitCode: 0, error: '' })
    expect(await read('app/not-found.tsx')).toBe('export default function NotFound() {}\n')
    expect(await read('lib/greeting.ts')).toBe('export const tone = "formal"\n')
  })

  it('refuses a config that changes srcDir', async () => {
    await createProject()
    await replaceIn('next-suite.config.ts', 'srcDir: false', 'srcDir: true')

    const result = await update()

    expect(result.exitCode).toBe(1)
    expect(result.error).toContain(
      'changes srcDir, which cannot change once the project is created',
    )
  })

  it('needs the project in Git with its lock committed', async () => {
    await create([PROJECT, ...QUIET])

    const result = await update()

    expect(result.exitCode).toBe(1)
    expect(result.error).toContain('next-suite update needs Git')
  })

  it('warns when an external plugin changed since the lock recorded it', async () => {
    const mail = (subject: string) => ({
      'mail/plugin.ts': [
        "import { definePlugin } from 'create-next-suite/plugin'",
        '',
        'export default definePlugin({',
        "  name: 'mail',",
        "  title: 'Mail',",
        "  files: { 'lib/mail.ts': 'files/mail.ts' },",
        '})',
        '',
      ].join('\n'),
      'mail/files/mail.ts': `export const subject = "${subject}"\n`,
    })
    await write(mail('Hello'))
    await createProject(['--plugin', './mail', '--mail'])
    await write(mail('Hi'))

    const result = await update()

    expect(result.output).toMatch(
      /Warning: mail \(\.\.\/mail\) changed since the last generation: its content sha256-\w{12} is sha256-\w{12} now\./,
    )
    expect(result.output).toMatch(/Warning: the old output ran mail \(\.\.\/mail\) as it is now/)
    expect(await read('lib/mail.ts')).toBe('export const subject = "Hi"\n')
  })

  it('formats both outputs like the project did after create, so untouched files stay as they are', async () => {
    const format = async (_command: string, args: readonly string[], cwd: string) => {
      if (args.join(' ') === 'run format') {
        for (const path of ['app/page.tsx', 'app/layout.tsx']) {
          const file = join(cwd, path)
          if (existsSync(file)) {
            await writeFile(file, (await readFile(file, 'utf8')).replaceAll('"', "'"))
          }
        }
      }
      return { isSuccess: true, output: '' }
    }
    await createProject()
    await mkdir(pathOf(`${PROJECT}/node_modules`))
    for (const path of ['app/page.tsx', 'app/layout.tsx']) {
      await writeProjectFile(path, (await read(path)).replaceAll('"', "'"))
    }
    const lock = parseLockFile(await read(PROJECT_PATHS.lock), PROJECT_PATHS.lock)
    const files = { ...lock.files }
    for (const path of ['app/page.tsx', 'app/layout.tsx']) {
      files[path] = hashFileContent(await read(path))
    }
    await writeProjectFile(PROJECT_PATHS.lock, renderLockFile({ ...lock, files }))
    commitAll(pathOf(PROJECT), 'chore: format')
    await replaceIn('app/layout.tsx', '      <body>\n', '      <body>\n        <header />\n')
    commitAll(pathOf(PROJECT), 'feat: header')
    await replaceIn('next-suite.config.ts', 'disable: []', 'disable: ["seo"]')

    const result = await update([], { runCommand: format })

    expect(result).toMatchObject({ exitCode: 0, error: '' })
    expect(result.output).not.toContain('app/page.tsx')
    expect(result.output).toContain('Merged with your changes:\n  app/layout.tsx\n')
    const layout = await read('app/layout.tsx')
    expect(layout).toContain("import './globals.css';")
    expect(layout).toContain('<header />')
    expect(layout).not.toContain('metadataBase')
  })
})

describe('next-suite update with a project of another version', () => {
  const OldVersion = '1.0.0'
  const OldLine = '// written by create-next-suite 1.0.0\n'

  /** Creates a project the way the pretended version 1.0.0 did: with a line in app/error.tsx. */
  const createAsOldVersion = async (directory: string, configPath?: string) => {
    const created = await create(
      configPath === undefined
        ? [directory, ...QUIET]
        : [directory, '--config', configPath, '--yes', '--no-git', '--no-install'],
      { cliVersion: OldVersion },
    )
    expect(created.error).toBe('')
    const errorPage = join(directory, 'app/error.tsx')
    const content = OldLine + (await readFile(pathOf(errorPage), 'utf8'))
    await writeFile(pathOf(errorPage), content)
    const lockPath = pathOf(join(directory, PROJECT_PATHS.lock))
    const lock = parseLockFile(await readFile(lockPath, 'utf8'), lockPath)
    await writeFile(
      lockPath,
      renderLockFile({
        ...lock,
        files: { ...lock.files, 'app/error.tsx': hashFileContent(content) },
      }),
    )
  }

  const setUp = async () => {
    await createAsOldVersion(PROJECT)
    initRepository(pathOf(PROJECT))
    commitAll(pathOf(PROJECT), 'chore: initial commit')
    await replaceIn('app/error.tsx', 'Try again', 'Try once more')
    commitAll(pathOf(PROJECT), 'fix: wording')
  }

  it('generates the old output with the version the lock names', async () => {
    await setUp()
    const requests: string[] = []

    const result = await update([], {
      runPublishedGenerator: async ({ version, configPath, workDirectory, targetName }) => {
        requests.push(version)
        await createAsOldVersion('old-output', configPath)
        await cp(pathOf('old-output'), join(workDirectory, targetName), { recursive: true })
        return { isSuccess: true, output: '' }
      },
    })

    expect(result).toMatchObject({ exitCode: 0, error: '' })
    expect(requests).toEqual([OldVersion])
    expect(result.output).not.toContain('Warning')
    const errorPage = await read('app/error.tsx')
    expect(errorPage).not.toContain(OldLine)
    expect(errorPage).toContain('Try once more')
  })

  it('falls back to the running version with a warning when the version cannot run', async () => {
    await setUp()

    const result = await update([], {
      runPublishedGenerator: async () => ({ isSuccess: false, output: 'npm ERR! network offline' }),
    })

    expect(result.exitCode).toBe(0)
    expect(result.output).toContain(
      'Warning: could not run create-next-suite@1.0.0, which generated the project (npm ERR! network offline); the old output comes from 2.0.0 instead',
    )
    expect(result.output).toContain(
      'Warning: the old output, generated once more, differs from the lock in app/error.tsx',
    )
    const errorPage = await read('app/error.tsx')
    expect(errorPage).toContain(OldLine)
    expect(errorPage).toContain('Try once more')
  })
})
