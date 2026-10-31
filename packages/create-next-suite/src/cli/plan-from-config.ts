import { relative, resolve } from 'node:path'

import { isInsideOrSame } from '../file-system/is-inside.ts'
import { parsePluginAddress } from '../loader/plugin-address.ts'
import type { RemoteEnvironment } from '../loader/remote/remote-source.ts'
import type { CommandRunner } from '../post-steps/run-command.ts'
import { loadSuiteConfig } from '../project-config/load-suite-config.ts'
import { collectAnswers } from '../questions/collect-answers.ts'
import { GIT_SETTING, INSTALL_SETTING } from '../questions/run-settings.ts'
import type { Streams } from '../ui/prompts.ts'
import { answersFromConfig } from './answers-from-config.ts'
import type { BuiltInAssets } from './built-in-assets.ts'
import { type ConfigAddress, configAddresses } from './config-addresses.ts'
import { fetchExternalPlugins } from './fetch-external-plugins.ts'
import { loadSelectedExternal } from './load-selected-external.ts'
import { planProject } from './plan-project.ts'
import { prepareQuestions } from './prepare-questions.ts'
import type { ProjectPlan } from './project-plan.ts'
import { readConfigSource } from './read-config-source.ts'

/** The target action of a plan nothing writes: the files go into memory only. */
const IN_MEMORY = 'overwrite'

/** What planning a project from its config needs. */
export type ConfigPlanEnvironment = {
  assets: BuiltInAssets
  pluginEntry: string
  configEntry: string
  remote: RemoteEnvironment
  userConfigPath: string
  runCommand: CommandRunner
  cliVersion: string
  cliSpecifier: string
  /** The terminal to ask about trust in, or nothing when the run cannot ask. */
  streams: Streams | undefined
}

/** An external plugin a plan ran, by the entry its config names it with. */
export type PlannedExternalPlugin = {
  name: string
  entry: string
  contentHash: string
}

/** A project planned from its config, and the external plugins it ran. */
export type ConfigPlan = {
  plan: ProjectPlan
  external: PlannedExternalPlugin[]
}

/**
 * The address a config entry is fetched from. A local directory outside the config's directory,
 * such as `../shared`, is taken relative to the project, so a config copied elsewhere, as for the
 * old output of an update, still finds it.
 */
const addressIn = (
  { entry, address }: ConfigAddress,
  { configDirectory, projectDirectory }: { configDirectory: string; projectDirectory: string },
): ConfigAddress => {
  if (parsePluginAddress(entry)?.kind !== 'local' || isInsideOrSame(configDirectory, address)) {
    return { entry, address }
  }
  return {
    entry,
    address: resolve(projectDirectory, relative(configDirectory, address)),
  }
}

/**
 * Plans the project a `next-suite.config.ts` describes, the way `create-next-suite --config` does,
 * without asking, writing or running anything after writing: its plugins, its project plugins
 * and overrides beside it, every answer from the config and external plugins once they are
 * trusted. The plan's post-steps are those of a run without git.
 *
 * @throws ProjectConfigError for a config that cannot be loaded or names what it cannot.
 * @throws TrustError for an external plugin that needs a trust question no terminal can ask.
 */
export const planFromConfig = async (
  environment: ConfigPlanEnvironment,
  { configPath, projectDirectory }: { configPath: string; projectDirectory: string },
): Promise<ConfigPlan> => {
  const { assets } = environment
  const loaded = await loadSuiteConfig(configPath, environment)
  const addresses = configAddresses(loaded).map((address) =>
    addressIn(address, { configDirectory: loaded.directory, projectDirectory }),
  )
  const fetched = await fetchExternalPlugins(
    { ...environment, cwd: projectDirectory },
    {
      addresses: addresses.map(({ address }) => address),
      known: [...assets.plugins, ...loaded.inlinePlugins],
    },
  )
  const plugins = [
    ...assets.plugins.map(({ plugin }) => plugin),
    ...loaded.inlinePlugins.map(({ plugin }) => plugin),
    ...fetched.map(({ summary }) => summary.metadata),
  ]
  const named = addresses.flatMap(({ entry, address }) => {
    const plugin = fetched.find((candidate) => candidate.address === address)
    return plugin === undefined ? [] : [{ entry, address, name: plugin.summary.metadata.name }]
  })
  const { questions } = prepareQuestions(plugins, undefined)
  const { answers } = await collectAnswers({
    directory: loaded.config.project.name,
    action: IN_MEMORY,
    hasExistingFiles: () => false,
    questions,
    plugins,
    input: {
      ...answersFromConfig({
        loaded,
        plugins,
        fetched: named,
        flagKeys: new Set(),
      }),
      [GIT_SETTING]: false,
      [INSTALL_SETTING]: false,
    },
    flagKeys: new Set(),
    mode: { kind: 'input', useDefaults: true },
  })
  const external = await loadSelectedExternal({
    external: fetched,
    answers,
    known: [...assets.plugins, ...loaded.inlinePlugins],
    flagPatterns: [],
    streams: environment.streams,
    environment,
  })
  const externalPlugins = external.map((plugin) => ({
    ...plugin,
    entry: named.find(({ address }) => address === plugin.address)?.entry ?? plugin.address,
  }))
  const plan = planProject({
    assets,
    externalPlugins,
    inlinePlugins: loaded.inlinePlugins,
    projectName: loaded.config.project.name,
    answers,
    cliVersion: environment.cliVersion,
    cliSpecifier: environment.cliSpecifier,
    configSource: await readConfigSource(loaded),
  })
  return {
    plan,
    external: externalPlugins.map(({ module, entry, contentHash }) => ({
      name: module.plugin.name,
      entry,
      contentHash,
    })),
  }
}
