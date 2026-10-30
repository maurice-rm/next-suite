import { join } from 'node:path'

import { PluginLoadError } from './plugin-load-error.ts'

/**
 * The directory of the plugins without a category; every other directory is named after a category.
 */
const EXTRAS_DIRECTORY = 'extras'

/**
 * Fails for a plugin outside the directory of its category, or of the extras without one.
 *
 * @throws PluginLoadError naming the directory the plugin belongs in.
 */
export const assertInGroup = (
  plugin: { category: string | undefined; location: string },
  { directory, group }: { directory: string; group: string },
): void => {
  const expected = plugin.category ?? EXTRAS_DIRECTORY
  if (expected !== group) {
    throw new PluginLoadError(plugin.location, `it belongs in ${join(directory, expected)}`)
  }
}
