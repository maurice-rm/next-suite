import { ExpectedError } from '../expected-error.ts'

/**
 * A plugin that cannot be loaded, named by its location: a directory, an address or a URL. The
 * detail says why, such as a missing `plugin.ts` or a failed download.
 */
export class PluginLoadError extends ExpectedError {
  override name = 'PluginLoadError'

  constructor(location: string, detail: string, options?: ErrorOptions) {
    super(`cannot load the plugin ${location}: ${detail}`, options)
  }
}
