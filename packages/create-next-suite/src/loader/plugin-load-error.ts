/** A plugin folder that cannot be loaded: missing or invalid manifest, unmet engine, bad file. */
export class PluginLoadError extends Error {
  readonly folder: string

  constructor(folder: string, detail: string, options?: ErrorOptions) {
    super(`create-next-suite: cannot load the plugin in ${folder}: ${detail}`, options)
    this.name = 'PluginLoadError'
    this.folder = folder
  }
}
