import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { PROJECT_NAME } from './project-name.ts'
import { runCli } from './run-cli.ts'

const TIMEOUT_MS = 120_000
const IDENTITY = ['-c', 'user.name=next-suite test', '-c', 'user.email=test@example.com']
const GREETING_PLUGIN = [
  "import { definePlugin } from 'create-next-suite/plugin'",
  '',
  'export default definePlugin({',
  "  name: 'greeting',",
  "  title: 'Greeting',",
  "  options: { tone: { question: 'Which tone?', choices: ['friendly', 'formal'], default: 'friendly' } },",
  "  files: { 'lib/greeting.ts': { source: 'files/greeting.ts', edit: (file, { options }) => file.setVariable('tone', JSON.stringify(options.tone)) } },",
  '})',
  '',
].join('\n')
const NOT_FOUND_OVERRIDE = [
  'export default function NotFound() {',
  '  return <h1>This plant has not grown yet.</h1>;',
  '}',
  '',
].join('\n')

let workspace: string
let project: string
/** A PATH with node and git only, so the install an update runs fails at once, without network. */
let path: string

const git = (args: string[]): string =>
  execFileSync('git', [...IDENTITY, ...args], {
    cwd: project,
    encoding: 'utf8',
  })

const commitAll = (message: string): void => {
  git(['add', '--all'])
  git(['commit', '--quiet', '--message', message])
}

const read = (file: string) => readFile(join(project, file), 'utf8')

const writeProjectFile = async (file: string, content: string) => {
  await mkdir(dirname(join(project, file)), { recursive: true })
  await writeFile(join(project, file), content)
}

const replaceIn = async (file: string, search: string, replacement: string) => {
  const content = await read(file)
  expect(content).toContain(search)
  await writeProjectFile(file, content.replace(search, replacement))
}

const nextSuite = (args: string[]) =>
  runCli('next-suite', args, { cwd: project, env: { PATH: path } })

/** A directory with links to node and git, the only programs the update needs here. */
const createPath = async (): Promise<string> => {
  const bin = join(workspace, 'bin')
  await mkdir(bin)
  await symlink(process.execPath, join(bin, 'node'))
  const gitPath = execFileSync('sh', ['-c', 'command -v git'], {
    encoding: 'utf8',
  }).trim()
  await symlink(gitPath, join(bin, 'git'))
  return bin
}

beforeAll(async () => {
  workspace = await mkdtemp(join(tmpdir(), 'next-suite-update-'))
  path = await createPath()
  const created = await runCli(
    'create-next-suite',
    [PROJECT_NAME, '--yes', '--no-install', '--no-logging', '--no-ci'],
    { cwd: workspace, env: { PATH: path } },
  )
  expect(created.exitCode).toBe(0)
  project = join(workspace, PROJECT_NAME)
}, TIMEOUT_MS)

afterAll(async () => {
  await rm(workspace, { recursive: true, force: true })
})

describe('next-suite update in a project you changed', { timeout: TIMEOUT_MS }, () => {
  it('keeps your edits while the config adds and disables plugins and changes an answer', async () => {
    await replaceIn(
      'app/layout.tsx',
      '      <body>\n',
      '      <body>\n        <header>Plants</header>\n',
    )
    await replaceIn(
      'app/page.tsx',
      'Get started by editing',
      'Welcome to my blog about plants. Edit',
    )
    await replaceIn('security-headers.ts', 'export ', '// Reviewed by the security team.\nexport ')
    await replaceIn(
      'package.json',
      '"dev": "next dev",',
      '"dev": "next dev",\n    "studio": "drizzle-kit studio",',
    )
    commitAll('feat: header, welcome text, review note, studio')

    await writeProjectFile('app/page.tsx', `${await read('app/page.tsx')}// wip\n`)
    const refused = await nextSuite(['update'])
    expect(refused.exitCode).toBe(1)
    expect(refused.stderr).toContain(
      'commit or stash your changes first, or pass --force: app/page.tsx',
    )
    git(['checkout', '--', 'app/page.tsx'])

    const added = await nextSuite(['add', 'pino'])
    expect(added.stderr).toBe('')
    expect(added.exitCode).toBe(0)
    expect(added.stdout).toContain('Added:\n  lib/logger.ts\n')
    expect(added.stdout).toMatch(
      /Note: could not install the dependencies; run `\w+ install` yourself/,
    )
    commitAll('chore: add pino')

    await writeProjectFile('next-suite/overrides/app/not-found.tsx', NOT_FOUND_OVERRIDE)
    await writeProjectFile('next-suite/plugins/greeting/plugin.ts', GREETING_PLUGIN)
    await writeProjectFile(
      'next-suite/plugins/greeting/files/greeting.ts',
      'export const tone = "friendly"\n',
    )
    await replaceIn(
      'next-suite.config.ts',
      '    "pino",\n',
      '    "pino",\n    "./next-suite/plugins/greeting",\n',
    )
    const disabled = await nextSuite(['disable', 'seo'])
    expect(disabled.stderr).toBe('')
    expect(disabled.stdout).toContain(
      'Removed:\n  app/robots.ts\n  app/sitemap.ts\n  lib/site-url.ts\n',
    )
    commitAll('chore: greeting, not-found override, no seo')

    await replaceIn(
      'next-suite.config.ts',
      'answers: {}',
      'answers: { greeting: { tone: "formal" } }',
    )
    const dryRun = await nextSuite(['update', '--dry-run'])
    expect(dryRun.stdout).toBe(
      'Replaced, unchanged by you:\n  lib/greeting.ts\nDry run, nothing was written.\n',
    )
    const updated = await nextSuite(['update'])
    expect(updated).toMatchObject({ exitCode: 0, stderr: '' })
    commitAll('chore: formal greeting')

    const layout = await read('app/layout.tsx')
    expect(layout).toContain('<header>Plants</header>')
    expect(layout).not.toContain('metadataBase')
    expect(await read('app/page.tsx')).toContain('Welcome to my blog about plants.')
    expect(await read('security-headers.ts')).toContain('// Reviewed by the security team.')
    const packageJson = JSON.parse(await read('package.json'))
    expect(packageJson.scripts.studio).toBe('drizzle-kit studio')
    expect(packageJson.dependencies.pino).toBeDefined()
    expect(await read('lib/logger.ts')).toContain('pino(')
    expect(existsSync(join(project, 'app/robots.ts'))).toBe(false)
    expect(await read('.env.example')).not.toContain('NEXT_PUBLIC_SITE_URL')
    expect(await read('app/not-found.tsx')).toBe(NOT_FOUND_OVERRIDE)
    expect(await read('lib/greeting.ts')).toBe('export const tone = "formal"\n')
    expect(git(['status', '--porcelain'])).toBe('')
  })

  it('stops at a merge conflict and records the update with --continue once it is resolved', async () => {
    await replaceIn(
      'next.config.ts',
      'cacheComponents: true,',
      'cacheComponents: true, // keep it on',
    )
    commitAll('chore: note on cache components')
    await replaceIn('next-suite.config.ts', 'cacheComponents: true', 'cacheComponents: false')
    const lockBefore = await read('.next-suite/lock.json')

    const conflicted = await nextSuite(['update'])

    expect(conflicted.exitCode).toBe(1)
    expect(conflicted.stdout).toContain(
      'Merge conflicts:\n  next.config.ts: 1 merge conflict, between <<<<<<< yours and >>>>>>> next-suite\n',
    )
    expect(conflicted.stderr).toContain('1 file has merge conflicts')
    expect(await read('next.config.ts')).toMatch(
      /<<<<<<< yours\n[\s\S]*=======\n[\s\S]*>>>>>>> next-suite\n/,
    )
    expect(await read('.next-suite/lock.json')).toBe(lockBefore)

    const early = await nextSuite(['update', '--continue'])
    expect(early.exitCode).toBe(1)
    expect(early.stderr).toContain('still hold merge conflict markers')

    const merged = await read('next.config.ts')
    await writeProjectFile(
      'next.config.ts',
      merged.replace(
        /<<<<<<< yours\n[\s\S]*?>>>>>>> next-suite\n/,
        '  cacheComponents: false, // off for now\n',
      ),
    )
    const continued = await nextSuite(['update', '--continue'])

    expect(continued).toMatchObject({ exitCode: 0, stderr: '' })
    expect(continued.stdout).toContain('Recorded the update in .next-suite/lock.json.')
    expect(JSON.parse(await read('.next-suite/lock.json')).project.cacheComponents).toBe(false)
    expect(existsSync(join(project, '.next-suite/pending-update.json'))).toBe(false)
    expect(await read('next.config.ts')).toContain('cacheComponents: false, // off for now')
  })
})
