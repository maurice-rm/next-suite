#!/usr/bin/env node
import { join } from 'node:path'

import packageJson from '../package.json' with { type: 'json' }
import { CREATE_COMMAND } from './cli/command-name.ts'
import { runIfNodeSupported } from './cli/run-if-node-supported.ts'

// The rest loads only after the check, so a Node.js that parses import attributes but is older
// than the engines range gets a message instead of a load error.
await runIfNodeSupported(CREATE_COMMAND, async () => {
  const { startCreate } = await import('./cli/start-create.ts')
  // The entry sits one level below the package root in src/ and dist/ alike.
  return startCreate({
    cliVersion: packageJson.version,
    packageRoot: join(import.meta.dirname, '..'),
  })
})
