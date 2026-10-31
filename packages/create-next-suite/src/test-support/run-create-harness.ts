import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PassThrough } from 'node:stream'
import { fileURLToPath } from 'node:url'

import ansis from 'ansis'
import * as tar from 'tar'
import { afterEach, beforeAll, beforeEach } from 'vitest'

import { type BuiltInAssets, loadBuiltInAssets } from '../cli/built-in-assets.ts'
import { type CreateEnvironment, runCreate } from '../cli/run-create.ts'
import { collectOutput } from './collect-output.ts'
import { COMMIT_SHA, type Routes, stubRemote } from './stub-remote.ts'
import { writeFiles } from './write-files.ts'

const CLI_VERSION = '2.0.0'
const COLUMNS = 80
const OUTSIDE_REPOSITORY = 'git rev-parse --is-inside-work-tree'
const PACKAGE_ROOT = fileURLToPath(new URL('../..', import.meta.url))
const PLUGIN_ENTRY = fileURLToPath(new URL('../plugin.ts', import.meta.url))
const CONFIG_ENTRY = fileURLToPath(new URL('../config.ts', import.meta.url))
/** Every prompt shows this key under it while it waits for input. */
const PROMPT_FOOTER = 'ctrl+c cancel'

type RunOptions = {
  isInteractive?: boolean
  /** Keys to press, one each time a prompt waits for input. */
  keys?: string[]
  userAgent?: string
  /** What the network answers; every other URL answers 404. */
  routes?: Routes
  /** Replaces the fake runner, which succeeds for every command but the git repository check. */
  runCommand?: CreateEnvironment['runCommand']
  /** The version of create-next-suite the run pretends to be. */
  cliVersion?: string
  /** What the project's devDependency on create-next-suite names; the version by default. */
  cliSpecifier?: string
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
  { root, assets }: { root: string; assets: BuiltInAssets },
  argv: string[],
  {
    isInteractive = false,
    keys = [],
    userAgent,
    routes = {},
    runCommand,
    cliVersion = CLI_VERSION,
    cliSpecifier = cliVersion,
  }: RunOptions,
): Promise<CreateRun> => {
  const commands: string[] = []
  const input = new PassThrough()
  const output = collectOutput(createKeyFeeder(input, keys))
  const error = collectOutput()
  const exitCode = await runCreate({
    argv,
    loadAssets: async () => assets,
    pluginEntry: PLUGIN_ENTRY,
    configEntry: CONFIG_ENTRY,
    remote: stubRemote(root, routes),
    userConfigPath: join(root, 'config.json'),
    cliVersion,
    cliSpecifier,
    cwd: root,
    streams: { input, output: output.stream, error: error.stream },
    isInteractive,
    columns: COLUMNS,
    userAgent,
    runCommand:
      runCommand ??
      (async (command, args) => {
        const line = [command, ...args].join(' ')
        commands.push(line)
        return { isSuccess: line !== OUTSIDE_REPOSITORY, output: '' }
      }),
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
 * Gives every test of a file a fresh directory, and runs create-next-suite in it with the built-in
 * plugins, a fake terminal, clock, network and command runner, and a user configuration in that
 * directory.
 */
export const setUpCreateRuns = () => {
  let root = ''
  let assets: BuiltInAssets = { baseFiles: new Map(), plugins: [] }
  beforeAll(async () => {
    assets = await loadBuiltInAssets(PACKAGE_ROOT, PLUGIN_ENTRY)
  })
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'next-suite-create-'))
  })
  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })
  return {
    pathOf: (path: string): string => join(root, path),
    write: (files: Readonly<Record<string, string>>): Promise<void> => writeFiles(root, files),
    run: (argv: string[], options: RunOptions = {}): Promise<CreateRun> =>
      runIn({ root, assets }, argv, options),
    githubRoutes: (name: string, files: Readonly<Record<string, string>>): Promise<Routes> =>
      githubRoutesIn(root, name, files),
  }
}
