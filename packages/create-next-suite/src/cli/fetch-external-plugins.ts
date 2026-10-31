import { assertUniqueNames } from '../loader/assert-unique-names.ts'
import { type FetchedPlugin, fetchExternalPlugin } from '../loader/fetch-external-plugin.ts'
import type { LoadedPluginModule } from '../loader/load-plugin-module.ts'
import type { RemoteEnvironment } from '../loader/remote/remote-source.ts'
import { readUserConfig } from '../user-config/user-config.ts'

/** Where external plugins are fetched from: the working directory, the network and the registries. */
type FetchEnvironment = {
  cwd: string
  remote: RemoteEnvironment
  userConfigPath: string
}

/**
 * Fetches the external plugins at the given addresses and reads their metadata, without running
 * any of their code; every plugin name stays unique, among them and the plugins already known,
 * such as the built-in plugins and those a config defines in place.
 */
export const fetchExternalPlugins = async (
  environment: FetchEnvironment,
  { addresses, known }: { addresses: readonly string[]; known: readonly LoadedPluginModule[] },
): Promise<FetchedPlugin[]> => {
  const external: FetchedPlugin[] = []
  if (addresses.length > 0) {
    const { registries } = await readUserConfig(environment.userConfigPath)
    for (const address of addresses) {
      external.push(
        await fetchExternalPlugin(address, {
          cwd: environment.cwd,
          remote: environment.remote,
          registries,
        }),
      )
    }
  }
  assertUniqueNames([
    ...known.map(({ plugin, directory }) => ({
      name: plugin.name,
      location: directory,
    })),
    ...external.map(({ summary, address }) => ({
      name: summary.metadata.name,
      location: address,
    })),
  ])
  return external
}
