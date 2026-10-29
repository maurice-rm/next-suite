#!/usr/bin/env node
import { program } from 'commander'

import packageJson from '../package.json' with { type: 'json' }

program
  .name('next-suite')
  .description('Manage plugin registries and trust for create-next-suite.')
  .version(packageJson.version)
  .action(() => {
    program.error('next-suite has no commands yet.')
  })

program.parse()
