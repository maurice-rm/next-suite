import type { Writable } from 'node:stream'

import type { RemoteEnvironment } from '../loader/remote/remote-source.ts'

/** Everything `next-suite` reads from outside: arguments, output, directory, network and config. */
export type NextSuiteEnvironment = {
  argv: readonly string[]
  cliVersion: string
  cwd: string
  output: Writable
  error: Writable
  remote: RemoteEnvironment
  userConfigPath: string
}

export type Report = (text: string) => void
