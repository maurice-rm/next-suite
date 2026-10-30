import { readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'

import type { Command } from 'commander'

import { PLUGIN_TEMPLATE_BLOCKS } from '../compose/template/block-helpers.ts'
import { checkTemplate } from '../compose/template/check-template.ts'
import { isTemplateSource } from '../contract/plugin-file.ts'
import { loadPlugin } from '../loader/load-plugin.ts'
import type { NextSuiteEnvironment, Report } from './next-suite-environment.ts'

/** Loads a plugin directory like any plugin and checks its templates against the template rules. */
const validatePlugin = async (environment: NextSuiteEnvironment, directory: string) => {
  const plugin = await loadPlugin(resolve(environment.cwd, directory))
  for (const file of plugin.manifest.files ?? []) {
    if (isTemplateSource(file.source)) {
      checkTemplate(
        await readFile(join(plugin.directory, file.source), 'utf8'),
        PLUGIN_TEMPLATE_BLOCKS,
      )
    }
  }
  return `${plugin.manifest.name} ${plugin.manifest.version} is a valid plugin`
}

/** Adds `next-suite plugin` with its subcommand validate. */
export const addPluginCommand = (
  program: Command,
  environment: NextSuiteEnvironment,
  report: Report,
): void => {
  program
    .command('plugin')
    .description('Work on plugins.')
    .command('validate <directory>')
    .description('check that a directory is a valid plugin with valid templates')
    .action(async (directory: string) => report(await validatePlugin(environment, directory)))
}
