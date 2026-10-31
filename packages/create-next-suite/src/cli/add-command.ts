import { join } from 'node:path'

import type { Command } from 'commander'

import { InputError } from '../input-error.ts'
import { parsePluginAddress } from '../loader/plugin-address.ts'
import type { PluginOption } from '../plugin-definition/plugin-option.ts'
import { addPluginToConfig } from '../project-config/edit-suite-config.ts'
import { findProjectRoot } from '../project-config/find-project-root.ts'
import { loadSuiteConfig } from '../project-config/load-suite-config.ts'
import { PROJECT_PATHS } from '../project-config/project-paths.ts'
import { changeConfigAndUpdate } from './change-config-and-update.ts'
import { configEntryOf } from './config-entry-of.ts'
import { fetchExternalPlugins } from './fetch-external-plugins.ts'
import type { NextSuiteEnvironment, Report } from './next-suite-environment.ts'
import { parseOptionAnswers } from './parse-option-answers.ts'

/** A plugin to add: the entry the config names it by, its name and its options. */
type ResolvedPlugin = {
  entry: string
  name: string
  options: Readonly<Record<string, PluginOption>>
}

/**
 * The plugin an argument names: a built-in plugin by its name, any other by its path or address,
 * fetched and read without running it.
 *
 * @throws InputError for a name that is no built-in plugin and no address.
 */
const resolvePlugin = async (
  environment: NextSuiteEnvironment,
  { root, argument }: { root: string; argument: string },
): Promise<ResolvedPlugin> => {
  const assets = await environment.loadAssets()
  const builtIn = assets.plugins.find(({ plugin }) => plugin.name === argument)
  if (builtIn !== undefined) {
    return {
      entry: argument,
      name: argument,
      options: builtIn.plugin.options ?? {},
    }
  }
  if (parsePluginAddress(argument) === undefined) {
    throw new InputError(
      `${argument} is no built-in plugin; name a plugin of your own by its path, such as ./${PROJECT_PATHS.plugins}/${argument}, or by its address`,
    )
  }
  const [fetched] = await fetchExternalPlugins(environment, {
    addresses: [argument],
    known: assets.plugins,
  })
  if (fetched === undefined) {
    throw new Error(`fetching ${argument} answered no plugin`)
  }
  return {
    entry: configEntryOf(fetched, {
      cwd: environment.cwd,
      projectDirectory: root,
    }),
    name: fetched.summary.metadata.name,
    options: fetched.summary.metadata.options ?? {},
  }
}

/** Fails when the config selects the plugin already and nothing is to change. */
const assertNotSelected = async (
  environment: NextSuiteEnvironment,
  { root, plugin, hasAnswers }: { root: string; plugin: ResolvedPlugin; hasAnswers: boolean },
): Promise<void> => {
  const { config } = await loadSuiteConfig(join(root, PROJECT_PATHS.config), environment)
  const isNamed = config.plugins.some((entry) =>
    typeof entry === 'string' ? entry === plugin.entry : entry.name === plugin.name,
  )
  const isDisabled = (config.disable ?? []).some((name) => name === plugin.name)
  if (isNamed && !isDisabled && !hasAnswers) {
    throw new InputError(`${PROJECT_PATHS.config} selects ${plugin.name} already`)
  }
}

const add = async (
  environment: NextSuiteEnvironment,
  report: Report,
  { argument, tokens, force }: { argument: string; tokens: readonly string[]; force: boolean },
): Promise<void> => {
  const root = findProjectRoot(environment.cwd)
  const plugin = await resolvePlugin(environment, { root, argument })
  const answers = parseOptionAnswers(tokens, {
    plugin: plugin.name,
    options: plugin.options,
  })
  await assertNotSelected(environment, {
    root,
    plugin,
    hasAnswers: Object.keys(answers).length > 0,
  })
  await changeConfigAndUpdate(environment, report, {
    root,
    edit: (text) =>
      addPluginToConfig(text, {
        entry: plugin.entry,
        name: plugin.name,
        answers,
      }),
    summary: `Added ${plugin.entry} to ${PROJECT_PATHS.config}.`,
    force,
  })
}

export const addAddCommand = (
  program: Command,
  environment: NextSuiteEnvironment,
  report: Report,
): void => {
  program
    .command('add')
    .description('add a plugin to next-suite.config.ts and update the project')
    .argument('<plugin>', 'a built-in plugin by its name, or a plugin by its path or address')
    .argument('[options...]', 'answers to the plugin’s options, such as --level debug')
    .option('--force', 'update over uncommitted changes, saved in the stash first')
    .allowUnknownOption()
    .action(async (argument: string, tokens: string[], { force }: { force?: boolean }) =>
      add(environment, report, { argument, tokens, force: force === true }),
    )
}
