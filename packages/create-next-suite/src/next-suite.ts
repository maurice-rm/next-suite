#!/usr/bin/env node
import { extname, join } from 'node:path'

import packageJson from '../package.json' with { type: 'json' }
import { NEXT_SUITE_COMMAND } from './cli/command-name.ts'
import { runIfNodeSupported } from './cli/run-if-node-supported.ts'

// The rest loads only after the check, so a Node.js that parses import attributes but is older
// than the engines range gets a message instead of a load error.
await runIfNodeSupported(NEXT_SUITE_COMMAND, async () => {
  const { startNextSuite } = await import('./cli/start-next-suite.ts')
  // As in create-next-suite.ts: the entry of create-next-suite/plugin sits next to this one.
  return startNextSuite({
    cliVersion: packageJson.version,
    pluginEntry: join(import.meta.dirname, `plugin${extname(import.meta.filename)}`),
  })
})
