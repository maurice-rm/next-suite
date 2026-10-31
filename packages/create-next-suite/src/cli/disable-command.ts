import { join } from 'node:path'

import type { Command } from 'commander'

import { InputError } from '../input-error.ts'
import { disablePluginInConfig } from '../project-config/edit-suite-config.ts'
import { findProjectRoot } from '../project-config/find-project-root.ts'
import { loadSuiteConfig } from '../project-config/load-suite-config.ts'
import { PROJECT_PATHS } from '../project-config/project-paths.ts'
import { readLockFile } from '../project-config/read-lock-file.ts'
import { changeConfigAndUpdate } from './change-config-and-update.ts'
import type { NextSuiteEnvironment, Report } from './next-suite-environment.ts'

/**
 * Fails for a plugin the project does not run, as its lock records, or one the config disables
 * already.
 */
const assertSelected = async (
  environment: NextSuiteEnvironment,
  { root, name }: { root: string; name: string },
): Promise<void> => {
  const lock = await readLockFile(root)
  if (!lock.plugins.some((plugin) => plugin.name === name)) {
    throw new InputError(
      `the project does not run ${name}; its plugins are ${lock.plugins.map((plugin) => plugin.name).join(', ')}`,
    )
  }
  const { config } = await loadSuiteConfig(join(root, PROJECT_PATHS.config), environment)
  if ((config.disable ?? []).some((disabled) => disabled === name)) {
    throw new InputError(`${PROJECT_PATHS.config} disables ${name} already`)
  }
}

const disable = async (
  environment: NextSuiteEnvironment,
  report: Report,
  { name, force }: { name: string; force: boolean },
): Promise<void> => {
  const root = findProjectRoot(environment.cwd)
  await assertSelected(environment, { root, name })
  await changeConfigAndUpdate(environment, report, {
    root,
    edit: (text) => disablePluginInConfig(text, name),
    summary: `Disabled ${name} in ${PROJECT_PATHS.config}.`,
    force,
  })
}

export const addDisableCommand = (
  program: Command,
  environment: NextSuiteEnvironment,
  report: Report,
): void => {
  program
    .command('disable <plugin>')
    .description('disable a plugin in next-suite.config.ts and update the project')
    .option('--force', 'update over uncommitted changes, saved in a stash commit first')
    .action(async (name: string, { force }: { force?: boolean }) =>
      disable(environment, report, { name, force: force === true }),
    )
}
