import type { ParsedPluginManifest } from '../contract/plugin-manifest.ts'

type Additions = Pick<ParsedPluginManifest, 'contributes' | 'dependencies' | 'devDependencies'>

/**
 * A manifest of the same plugin with nothing but the given contributions and dependencies, so
 * they merge like those of any other manifest.
 */
export const derivedManifest = (
  manifest: ParsedPluginManifest,
  additions: Additions,
): ParsedPluginManifest => ({
  name: manifest.name,
  version: manifest.version,
  contract: manifest.contract,
  title: manifest.title,
  description: manifest.description,
  ...additions,
})
