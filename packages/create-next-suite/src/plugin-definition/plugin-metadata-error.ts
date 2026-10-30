import { ExpectedError } from '../expected-error.ts'

/** A `plugin.ts` whose metadata cannot be read without running it, or is invalid. */
export class PluginMetadataError extends ExpectedError {
  override name = 'PluginMetadataError'
}
