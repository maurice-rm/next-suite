#!/usr/bin/env node
import { join } from 'node:path'

import packageJson from '../package.json' with { type: 'json' }
import { findNodeVersionProblem } from './cli/check-node-version.ts'

const EXIT_FAILURE = 1

// Checked before the rest loads, so an old Node.js gets this message instead of a load error.
const nodeProblem = findNodeVersionProblem({
  command: 'create-next-suite',
  current: process.versions.node,
  required: packageJson.engines.node,
})
if (nodeProblem === undefined) {
  const { startCreate } = await import('./cli/start-create.ts')
  // The entry sits one level below the package root in src/ and dist/ alike.
  process.exitCode = await startCreate({
    cliVersion: packageJson.version,
    packageRoot: join(import.meta.dirname, '..'),
  })
} else {
  process.stderr.write(`${nodeProblem}\n`)
  process.exitCode = EXIT_FAILURE
}
