import { ExpectedError } from '../expected-error.ts'

/** A plugin folder that cannot be loaded: missing or invalid manifest, unmet contract, bad file. */
export class PluginLoadError extends ExpectedError {
  override name = 'PluginLoadError'
  readonly folder: string

  constructor(folder: string, detail: string, options?: ErrorOptions) {
    super(`cannot load the plugin in ${folder}: ${detail}`, options)
    this.folder = folder
  }
}
