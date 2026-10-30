import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PassThrough } from 'node:stream'
import { fileURLToPath } from 'node:url'

import ansis from 'ansis'
import { afterEach, beforeAll, beforeEach } from 'vitest'

import { type BuiltInAssets, loadBuiltInAssets } from '../cli/built-in-assets.ts'
import { type CreateEnvironment, runCreate } from '../cli/run-create.ts'
import { collectOutput } from './collect-output.ts'
import { writeFiles } from './write-files.ts'

const CLI_VERSION = '2.0.0'
const COLUMNS = 80
const NOW = new Date('2026-11-01T10:00:00Z')
const OUTSIDE_REPOSITORY = 'git rev-parse --is-inside-work-tree'
const PACKAGE_ROOT = fileURLToPath(new URL('../..', import.meta.url))
const PLUGIN_ENTRY = fileURLToPath(new URL('../plugin.ts', import.meta.url))
/** Every prompt shows this key under it while it waits for input. */
const PROMPT_FOOTER = 'ctrl+c cancel'

type RunOptions = {
  isInteractive?: boolean
  /** Keys to press, one each time a prompt waits for input. */
  keys?: string[]
  userAgent?: string
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
  { root, assets }: { root: string; assets: BuiltInAssets },
  argv: string[],
  { isInteractive = false, keys = [], userAgent, runCommand }: RunOptions,
): Promise<CreateRun> => {
  const commands: string[] = []
  const input = new PassThrough()
  const output = collectOutput(createKeyFeeder(input, keys))
  const error = collectOutput()
  const exitCode = await runCreate({
    argv,
    loadAssets: async () => assets,
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
    fetchLatestVersion: async () => undefined,
  })
  return {
    exitCode,
    output: ansis.strip(output.text()),
    error: ansis.strip(error.text()),
    commands,
  }
}

/**
 * Gives every test of a file a fresh directory, and runs create-next-suite in it with the built-in
 * plugins and a fake terminal, clock and command runner.
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
  }
}
