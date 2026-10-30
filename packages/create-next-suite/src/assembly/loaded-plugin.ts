import type { Plugin } from '../plugin-definition/plugin-definition.ts'

/** A plugin and how to read the files of its directory, such as `files/auth.ts`. */
export type LoadedPlugin = {
  plugin: Plugin
  /** The text of a file of the plugin's directory; a missing file throws. */
  readFile: (source: string) => string
}
