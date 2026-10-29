#!/usr/bin/env node
import packageJson from '../package.json' with { type: 'json' }
import { findNodeVersionProblem } from './cli/check-node-version.ts'

const EXIT_FAILURE = 1

// Checked before the rest loads, so an old Node.js gets this message instead of a load error.
const nodeProblem = findNodeVersionProblem({
  command: 'next-suite',
  current: process.versions.node,
  required: packageJson.engines.node,
})
if (nodeProblem === undefined) {
  const { runNextSuite } = await import('./cli/run-next-suite.ts')
  const { processRemoteEnvironment, processUserConfigPath } = await import(
    './cli/process-environment.ts'
  )
  process.exitCode = await runNextSuite({
    argv: process.argv.slice(2),
    version: packageJson.version,
    cwd: process.cwd(),
    output: process.stdout,
    error: process.stderr,
    remote: processRemoteEnvironment(),
    userConfigPath: processUserConfigPath(),
  })
} else {
  process.stderr.write(`${nodeProblem}\n`)
  process.exitCode = EXIT_FAILURE
}
