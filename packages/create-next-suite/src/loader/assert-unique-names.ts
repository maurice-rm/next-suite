import { PluginLoadError } from './plugin-load-error.ts'

/** A loaded plugin by its name and the directory or address it was loaded from. */
type NamedPlugin = { name: string; location: string }

export const assertUniqueNames = (plugins: readonly NamedPlugin[]): void => {
  const seen = new Set<string>()
  for (const { name, location } of plugins) {
    if (seen.has(name)) {
      throw new PluginLoadError(location, `two plugins are named ${name}`)
    }
    seen.add(name)
  }
}
