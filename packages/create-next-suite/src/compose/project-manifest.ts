import { CONTRACT_VERSION } from '../contract/plugin-manifest.ts'
import type { LoadedPlugin } from '../loader/load-plugin.ts'

export const PROJECT_MANIFEST_FILE = 'next-suite.json'

type ProjectManifestInput = {
  cliVersion: string
  createdAt: Date
  plugins: readonly LoadedPlugin[]
  answers: Readonly<Record<string, unknown>>
}

/**
 * The content of next-suite.json: what generated the project, for people, a later `add` and
 * migrations. next-suite never reads it while the project runs.
 */
export const createProjectManifest = ({
  cliVersion,
  createdAt,
  plugins,
  answers,
}: ProjectManifestInput): string => {
  const manifest = {
    cli: cliVersion,
    contract: CONTRACT_VERSION,
    createdAt: createdAt.toISOString(),
    plugins: plugins.map(({ manifest: plugin }) => ({
      name: plugin.name,
      source: 'builtin',
      version: plugin.version,
    })),
    answers,
  }
  return `${JSON.stringify(manifest, null, 2)}\n`
}
