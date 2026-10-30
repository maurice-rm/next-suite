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
import { extname, join, resolve } from 'node:path'
import { Readable } from 'node:stream'

import packageJson from '../package.json' with { type: 'json' }
import { loadBuiltInAssets } from './cli/built-in-assets.ts'
import { processRemoteEnvironment } from './cli/process-environment.ts'
import { runCreate } from './cli/run-create.ts'
import { parsePluginAddress } from './loader/plugin-address.ts'
import { type CommandResult, runCommand } from './post-steps/run-command.ts'
import { collectOutput } from './test-support/collect-output.ts'
import { sourceOf } from './trust/trust-pattern.ts'

const PROJECT_NAME = 'test-app'
const DEFAULT_PACKAGE_MANAGER = 'pnpm'
/** The cache and user configuration of a test run live in its parent, apart from the user's. */
const CACHE_DIRECTORY = '.next-suite-cache'
const USER_CONFIG_FILE = 'next-suite-config.json'

/** A local address as an absolute path from the current directory; any other address as it is. */
const fromCurrentDirectory = (address: string): string =>
  parsePluginAddress(address)?.kind === 'local' ? resolve(address) : address

/** What to generate: the plugins under test and the answers for them and any other question. */
export type TestProjectOptions = {
  /**
   * Addresses of the plugins under test, such as `./my-plugin`, relative to the current directory,
   * or `github:acme/plugins/mail`; they are trusted for the test without asking, and nothing is
   * recorded in the user configuration. Registry short names such as `@acme/mail` are unknown to
   * the test's own configuration.
   */
  plugins: readonly string[]
  /** Answers keyed by question, such as `linter`; every other question takes its default. */
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
 * answer given or its default, git stays off. A plugin without a category is selected by its name
 * in `answers`. The run keeps its cache and user configuration in `parent`, apart from the
 * user's; plugins from npm, GitHub, GitLab or URLs are still fetched over the network.
 *
 * @param options - The plugins under test, the answers and how to generate.
 * @returns The generated project, ready to run its scripts.
 * @throws Error with the output of the run when the project cannot be generated, such as for a
 * plugin that does not load.
 *
 * @example
 * ```ts
 * import { createTestProject } from 'create-next-suite/testing'
 * import { expect, test } from 'vitest'
 *
 * test('the project builds with my plugin and Biome', async () => {
 *   const project = await createTestProject({
 *     plugins: ['./my-plugin'],
 *     answers: { 'my-plugin': true, linter: 'biome' },
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
  const pluginEntry = join(import.meta.dirname, `plugin${extname(import.meta.filename)}`)
  const configEntry = join(import.meta.dirname, `config${extname(import.meta.filename)}`)
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
      ...options.plugins.flatMap((address) => [
        '--plugin',
        fromCurrentDirectory(address),
        '--trust',
        sourceOf(address),
      ]),
    ],
    loadAssets: () => loadBuiltInAssets(join(import.meta.dirname, '..'), pluginEntry),
    pluginEntry,
    configEntry,
    remote: { ...processRemoteEnvironment(), cacheDir: join(parent, CACHE_DIRECTORY) },
    userConfigPath: join(parent, USER_CONFIG_FILE),
    cliVersion: packageJson.version,
    cliSpecifier: packageJson.version,
    cwd: parent,
    streams: { input: Readable.from([]), output: output.stream, error: output.stream },
    isInteractive: false,
    columns: 80,
    userAgent: undefined,
    runCommand,
    fetchLatestVersion: async () => undefined,
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
