import {
  type ParsedPluginManifest,
  type PluginManifest,
  pluginManifestSchema,
} from '../contract/plugin-manifest.ts'

/** A minimal valid manifest for a test plugin, with the fields a test needs on top. */
const testManifest = (name: string, extra: Partial<PluginManifest> = {}): PluginManifest => ({
  name,
  version: '1.0.0',
  contract: '^1.0.0',
  title: name,
  description: `The ${name} plugin.`,
  ...extra,
})

/** A test manifest as the loader answers it, with every default applied. */
export const parseTestManifest = (
  name: string,
  extra: Partial<PluginManifest> = {},
): ParsedPluginManifest => pluginManifestSchema.parse(testManifest(name, extra))

/** A test manifest as the text of a plugin.json. */
export const testManifestJson = (name: string, extra: Partial<PluginManifest> = {}): string =>
  JSON.stringify(testManifest(name, extra))
