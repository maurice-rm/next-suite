import type { LoadedPlugin } from './load-plugin.ts'
import { PluginLoadError } from './plugin-load-error.ts'

export const assertUniqueNames = (plugins: readonly LoadedPlugin[]): void => {
  const seen = new Set<string>()
  for (const plugin of plugins) {
    if (seen.has(plugin.manifest.name)) {
      throw new PluginLoadError(plugin.directory, `two plugins are named ${plugin.manifest.name}`)
    }
    seen.add(plugin.manifest.name)
  }
}
