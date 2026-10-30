import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PassThrough } from 'node:stream'

import ansis from 'ansis'
import * as tar from 'tar'
import { afterEach, beforeEach } from 'vitest'

import { type CreateEnvironment, runCreate } from '../cli/run-create.ts'
import { loadAssets } from '../loader/load-assets.ts'
import { collectOutput } from './collect-output.ts'
import { COMMIT_SHA, type Routes, stubRemote } from './stub-remote.ts'
import { testManifestJson } from './test-manifest.ts'
import { writeFiles } from './write-files.ts'

const CLI_VERSION = '2.0.0'
const COLUMNS = 80
const NOW = new Date('2026-11-01T10:00:00Z')
const OUTSIDE_REPOSITORY = 'git rev-parse --is-inside-work-tree'
/** Every prompt shows this key under it while it waits for input. */
const PROMPT_FOOTER = 'ctrl+c cancel'

/** The package assets of a run: two categories, a base project, three plugins and an extra. */
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
  /** Keys to press, one each time a prompt waits for input. */
  keys?: string[]
  userAgent?: string
  routes?: Routes
  /** Replaces the fake runner, which succeeds for every command but the git repository check. */
  runCommand?: CreateEnvironment['runCommand']
}

/** What a run printed, answered and ran, with colours stripped. */
export type CreateRun = { exitCode: number; output: string; error: string; commands: string[] }

/** Feeds the next key each time a prompt has rendered and waits for input. */
const createKeyFeeder = (input: PassThrough, keys: readonly string[]) => {
  const remaining = [...keys]
  return (chunk: string): void => {
    if (!ansis.strip(chunk).includes(PROMPT_FOOTER)) {
      return
    }
    const key = remaining.shift()
    if (key !== undefined) {
      setImmediate(() => input.write(key))
    }
  }
}

const runIn = async (
  root: string,
  argv: string[],
  { isInteractive = false, keys = [], userAgent, routes = {}, runCommand }: RunOptions,
): Promise<CreateRun> => {
  const commands: string[] = []
  const input = new PassThrough()
  const output = collectOutput(createKeyFeeder(input, keys))
  const error = collectOutput()
  const exitCode = await runCreate({
    argv,
    loadAssets: () => loadAssets(join(root, 'assets')),
    cliVersion: CLI_VERSION,
    cwd: root,
    streams: { input, output: output.stream, error: error.stream },
    isInteractive,
    columns: COLUMNS,
    now: () => NOW,
    userAgent,
    runCommand:
      runCommand ??
      (async (command, args) => {
        const line = [command, ...args].join(' ')
        commands.push(line)
        return { isSuccess: line !== OUTSIDE_REPOSITORY, output: '' }
      }),
    remote: stubRemote(root, routes),
    userConfigPath: join(root, 'config.json'),
    fetchLatestVersion: async () => undefined,
  })
  return {
    exitCode,
    output: ansis.strip(output.text()),
    error: ansis.strip(error.text()),
    commands,
  }
}

/** Serves a GitHub tarball of a plugin directory for `github:acme/plugins/<name>` at COMMIT_SHA. */
const githubRoutesIn = async (
  root: string,
  name: string,
  files: Readonly<Record<string, string>>,
): Promise<Routes> => {
  const top = join(root, 'github-source')
  await writeFiles(join(top, 'repo', name), files)
  const file = join(root, 'github.tgz')
  await tar.c({ gzip: true, file, cwd: top }, ['repo'])
  const archive = new Uint8Array(await readFile(file))
  await rm(top, { recursive: true, force: true })
  return {
    'https://api.github.com/repos/acme/plugins/commits/HEAD': () => new Response(COMMIT_SHA),
    [`https://api.github.com/repos/acme/plugins/tarball/${COMMIT_SHA}`]: () =>
      new Response(archive),
  }
}

/**
 * Gives every test of a file a fresh directory with the package assets, and runs create-next-suite
 * in it with a fake terminal, clock and command runner.
 */
export const setUpCreateRuns = () => {
  let root = ''
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'next-suite-create-'))
    await writeFiles(root, ASSETS)
  })
  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })
  return {
    pathOf: (path: string): string => join(root, path),
    write: (files: Readonly<Record<string, string>>): Promise<void> => writeFiles(root, files),
    run: (argv: string[], options: RunOptions = {}): Promise<CreateRun> =>
      runIn(root, argv, options),
    githubRoutes: (name: string, files: Readonly<Record<string, string>>): Promise<Routes> =>
      githubRoutesIn(root, name, files),
  }
}
