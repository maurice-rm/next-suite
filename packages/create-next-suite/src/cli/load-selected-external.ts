import { type Answers, isSelected } from '../answers/answers.ts'
import type { FetchedPlugin } from '../loader/fetch-external-plugin.ts'
import { type LoadedExternalPlugin, loadExternalPlugin } from '../loader/load-external-plugin.ts'
import type { LoadedPluginModule } from '../loader/load-plugin-module.ts'
import type { RemoteEnvironment } from '../loader/remote/remote-source.ts'
import type { CommandRunner } from '../post-steps/run-command.ts'
import { assertCompatible, findIncompatibilities } from '../questions/find-incompatibilities.ts'
import type { Streams } from '../ui/prompts.ts'
import { confirmTrust } from './confirm-trust.ts'

/** What loading the selected external plugins needs. */
type SelectedExternal = {
  /** The external plugins fetched and read, selected or not. */
  external: readonly FetchedPlugin[]
  answers: Answers
  /** The plugins that run beside them: built-in and defined in a config. */
  known: readonly LoadedPluginModule[]
  /** Patterns from `--trust`, trusted for this run only. */
  flagPatterns: readonly string[]
  /** The terminal to ask about trust in, or nothing when the run cannot ask. */
  streams: Streams | undefined
  environment: {
    userConfigPath: string
    pluginEntry: string
    remote: RemoteEnvironment
    runCommand: CommandRunner
  }
}

/**
 * Runs the selected external plugins once the user trusts them, and checks their preconditions
 * against the answers.
 *
 * @throws TrustError for a plugin that would need a trust question in a run that cannot ask.
 * @throws PromptCancelledError when the user cancels a trust question.
 */
export const loadSelectedExternal = async ({
  external,
  answers,
  known,
  flagPatterns,
  streams,
  environment,
}: SelectedExternal): Promise<LoadedExternalPlugin[]> => {
  const selected = external.filter((plugin) => isSelected(answers, plugin.summary.metadata.name))
  await confirmTrust({
    plugins: selected,
    flagPatterns,
    userConfigPath: environment.userConfigPath,
    streams,
  })
  const loaded: LoadedExternalPlugin[] = []
  for (const plugin of selected) {
    loaded.push(
      await loadExternalPlugin(plugin, {
        pluginEntry: environment.pluginEntry,
        cacheDir: environment.remote.cacheDir,
        runCommand: environment.runCommand,
      }),
    )
  }
  assertCompatible(
    findIncompatibilities(
      [...known, ...loaded.map(({ module }) => module)].map(({ plugin }) => plugin),
      answers,
    ),
  )
  return loaded
}
