#!/usr/bin/env node
import { program } from 'commander'

import packageJson from '../package.json' with { type: 'json' }

program
  .name('create-next-suite')
  .description('Create a Next.js app from plugins.')
  .version(packageJson.version)
  .action(() => {
    program.error('create-next-suite generates no projects yet.')
  })

program.parse()
