import { CONTRACT_VERSION } from '../contract/plugin-manifest.ts'
import type { LoadedPlugin } from '../loader/load-plugin.ts'

export const PROJECT_MANIFEST_FILE = 'next-suite.json'

/** A plugin as next-suite.json records it: where it came from and its version. */
export type RecordedPlugin = {
  name: string
  /** `builtin`, or the address a user gave. */
  source: string
  /** The commit or version the address resolved to, for an external plugin. */
  resolved?: string
  version: string
}

type ProjectManifestInput = {
  cliVersion: string
  createdAt: Date
  plugins: readonly RecordedPlugin[]
  answers: Readonly<Record<string, unknown>>
}

/** A plugin loaded from its manifest as next-suite.json records it. */
export const recordPlugin = ({ manifest, source }: LoadedPlugin): RecordedPlugin => ({
  name: manifest.name,
  source: source.kind === 'builtin' ? 'builtin' : source.address,
  ...(source.kind === 'external' && source.resolved !== undefined
    ? { resolved: source.resolved }
    : {}),
  version: manifest.version,
})

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
    plugins: plugins.map(({ name, source, resolved, version }) => ({
      name,
      source,
      ...(resolved === undefined ? {} : { resolved }),
      version,
    })),
    answers,
  }
  return `${JSON.stringify(manifest, null, 2)}\n`
}
