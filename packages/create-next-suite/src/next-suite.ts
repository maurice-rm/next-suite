#!/usr/bin/env node
import packageJson from '../package.json' with { type: 'json' }
import { NEXT_SUITE_COMMAND } from './cli/command-name.ts'
import { runIfNodeSupported } from './cli/run-if-node-supported.ts'

// The rest loads only after the check, so a Node.js that parses import attributes but is older
// than the engines range gets a message instead of a load error.
await runIfNodeSupported(NEXT_SUITE_COMMAND, async () => {
  const { startNextSuite } = await import('./cli/start-next-suite.ts')
  return startNextSuite({ cliVersion: packageJson.version })
})
