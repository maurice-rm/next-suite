import type { Command } from 'commander'

import { refuseExternalPlugins } from './external-plugins.ts'
export const addPluginCommand = (program: Command): void => {
  program
    .command('plugin')
    .description('Work on plugins.')
    .command('validate <directory>')
    .description('check that a directory is a valid plugin')
    .action(() => refuseExternalPlugins('plugin validate'))
}
