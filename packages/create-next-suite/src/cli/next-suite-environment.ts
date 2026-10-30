import type { Writable } from 'node:stream'

import type { InstallRunner } from '../loader/install-plugin-dependencies.ts'
import type { RemoteEnvironment } from '../loader/remote/remote-source.ts'

/**
 * Everything `next-suite` reads from outside: arguments, output, directory, network, config, and
 * what a plugin it validates runs with.
 */
export type NextSuiteEnvironment = {
  argv: readonly string[]
  cliVersion: string
  cwd: string
  output: Writable
  error: Writable
  remote: RemoteEnvironment
  userConfigPath: string
  /** The entry a validated plugin imports `create-next-suite/plugin` from. */
  pluginEntry: string
  /** Runs npm for the dependencies of a validated plugin. */
  runCommand: InstallRunner
}

export type Report = (text: string) => void
