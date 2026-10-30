/**
 * Test helpers for plugin authors: generate a project with the plugins under test, then run its
 * scripts, the way the CI of create-next-suite checks its own plugins.
 *
 * @example
 * ```ts
 * import { createTestProject } from 'create-next-suite/testing'
 *
 * const project = await createTestProject({
 *   plugins: ['./my-plugin'],
 *   answers: { 'my-plugin': true },
 *   install: true,
 * })
 * expect((await project.run('build')).isSuccess).toBe(true)
 * ```
 *
 * @packageDocumentation
 */
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { extname, join } from 'node:path'
import { Readable } from 'node:stream'

import packageJson from '../package.json' with { type: 'json' }
import { loadEngineV2Assets } from './cli/engine-v2/engine-v2-assets.ts'
import { processRemoteEnvironment, processUserConfigPath } from './cli/process-environment.ts'
import { runCreate } from './cli/run-create.ts'
import { loadAssets } from './loader/load-assets.ts'
import { type CommandResult, runCommand } from './post-steps/run-command.ts'
import { collectOutput } from './test-support/collect-output.ts'
import { sourceOf } from './trust/trust-level.ts'

const PROJECT_NAME = 'test-app'
const DEFAULT_PACKAGE_MANAGER = 'pnpm'

/** What to generate: the plugins under test and the answers for them and any other question. */
export type TestProjectOptions = {
  /** Addresses of the plugins under test, such as `./my-plugin`; they are trusted for the test. */
  plugins: readonly string[]
  /** Answers in the format of `answers` in next-suite.json; every other question takes its default. */
  answers?: Readonly<Record<string, unknown>>
  /** The package manager plugin to use; pnpm by default. */
  packageManager?: string
  /** Whether to install the dependencies, which a script run needs; off by default. */
  install?: boolean
  /** The directory the project is created in; a fresh temporary directory by default. */
  parent?: string
}

/** How a script of a test project ended. */
export type ScriptResult = CommandResult

/** A generated test project. */
export type TestProject = {
  /** The project directory. */
  directory: string
  /** What the run printed. */
  output: string
  /**
   * Runs a script of the project with its package manager. A script that fails or cannot start
   * resolves with `isSuccess: false` rather than rejecting.
   *
   * @param script - The name of the script in package.json, such as `build`.
   */
  run: (script: string) => Promise<ScriptResult>
}

/**
 * Generates a project with the plugins under test, without a terminal: every question takes the
 * answer given or its default, git stays off.
 *
 * @param options - The plugins under test, the answers and how to generate.
 * @returns The generated project, ready to run its scripts.
 * @throws Error with the output of the run when the project cannot be generated.
 *
 * @example
 * ```ts
 * import { createTestProject } from 'create-next-suite/testing'
 * import { expect, test } from 'vitest'
 *
 * test('the project builds with my plugin', async () => {
 *   const project = await createTestProject({
 *     plugins: ['./my-plugin'],
 *     answers: { 'my-plugin': true },
 *     install: true,
 *   })
 *
 *   expect((await project.run('build')).isSuccess).toBe(true)
 * })
 * ```
 */
export const createTestProject = async (options: TestProjectOptions): Promise<TestProject> => {
  const parent = options.parent ?? (await mkdtemp(join(tmpdir(), 'next-suite-test-')))
  const answersFile = join(parent, 'answers.json')
  await writeFile(answersFile, JSON.stringify(options.answers ?? {}))
  const packageManager = options.packageManager ?? DEFAULT_PACKAGE_MANAGER
  const output = collectOutput()
  const exitCode = await runCreate({
    argv: [
      PROJECT_NAME,
      '--yes',
      '--answers',
      answersFile,
      '--package-manager',
      packageManager,
      '--no-git',
      ...(options.install === true ? [] : ['--no-install']),
      ...options.plugins.flatMap((address) => ['--plugin', address, '--trust', sourceOf(address)]),
    ],
    loadAssets: () => loadAssets(join(import.meta.dirname, '..')),
    cliVersion: packageJson.version,
    cwd: parent,
    streams: { input: Readable.from([]), output: output.stream, error: output.stream },
    isInteractive: false,
    columns: 80,
    now: () => new Date(),
    userAgent: undefined,
    runCommand,
    remote: processRemoteEnvironment(),
    userConfigPath: processUserConfigPath(),
    fetchLatestVersion: async () => undefined,
    engine: undefined,
    loadEngineV2Assets: () =>
      loadEngineV2Assets(
        join(import.meta.dirname, '..'),
        join(import.meta.dirname, `plugin${extname(import.meta.filename)}`),
      ),
  })
  if (exitCode !== 0) {
    throw new Error(`create-next-suite could not generate the test project:\n${output.text()}`)
  }
  const directory = join(parent, PROJECT_NAME)
  return {
    directory,
    output: output.text(),
    run: (script) => runCommand(packageManager, ['run', script], directory),
  }
}
