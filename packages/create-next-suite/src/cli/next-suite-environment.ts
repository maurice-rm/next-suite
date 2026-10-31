import type { Readable, Writable } from 'node:stream'

import type { RemoteEnvironment } from '../loader/remote/remote-source.ts'
import type { CommandRunner } from '../post-steps/run-command.ts'
import type { BuiltInAssets } from './built-in-assets.ts'
import type { PublishedGeneratorRunner } from './run-published-generator.ts'

/**
 * Everything `next-suite` reads from outside: arguments, terminal, directory, network, config,
 * what a plugin it validates or runs runs with, and the published versions an update may run.
 */
export type NextSuiteEnvironment = {
  argv: readonly string[]
  cliVersion: string
  /** What an updated project's devDependency on create-next-suite names: the running version. */
  cliSpecifier: string
  cwd: string
  input: Readable
  output: Writable
  error: Writable
  /** Whether the terminal can answer questions, such as whether to trust a plugin. */
  isInteractive: boolean
  remote: RemoteEnvironment
  userConfigPath: string
  /** Loads the base project and the built-in plugins of the package. */
  loadAssets: () => Promise<BuiltInAssets>
  /** The entry a plugin imports `create-next-suite/plugin` from. */
  pluginEntry: string
  /** The entry a project's config imports `create-next-suite/config` from. */
  configEntry: string
  /** Runs npm, the package manager and the scripts of a project. */
  runCommand: CommandRunner
  /** Runs a published version of create-next-suite, such as the one a lock names. */
  runPublishedGenerator: PublishedGeneratorRunner
}

export type Report = (text: string) => void
