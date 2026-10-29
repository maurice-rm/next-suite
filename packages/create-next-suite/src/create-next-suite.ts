#!/usr/bin/env node
import { join } from 'node:path'

import packageJson from '../package.json' with { type: 'json' }
import { loadAssets } from './cli/load-assets.ts'
import { runCreate } from './cli/run-create.ts'
import { runCommand } from './package-manager/run-command.ts'

const DEFAULT_COLUMNS = 80

process.exitCode = await runCreate({
  argv: process.argv.slice(2),
  assets: await loadAssets(join(import.meta.dirname, '..')),
  cliVersion: packageJson.version,
  cwd: process.cwd(),
  streams: { input: process.stdin, output: process.stdout, error: process.stderr },
  isInteractive: process.stdin.isTTY && process.stdout.isTTY,
  columns: process.stdout.columns ?? DEFAULT_COLUMNS,
  now: () => new Date(),
  userAgent: process.env.npm_config_user_agent,
  runCommand,
})
