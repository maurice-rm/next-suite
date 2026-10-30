/** The file that records how a project was generated. */
export const PROJECT_MANIFEST_FILE = 'next-suite.json'

/** The version of the plugin contract next-suite.json records. */
const CONTRACT_VERSION = '1.0.0'

/** A plugin as next-suite.json records it: where it came from and its version. */
type RecordedPlugin = {
  name: string
  /** `builtin`, or the address a user gave. */
  source: string
  version: string
}

type ProjectManifestInput = {
  cliVersion: string
  createdAt: Date
  plugins: readonly RecordedPlugin[]
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
    plugins: plugins.map(({ name, source, version }) => ({ name, source, version })),
    answers,
  }
  return `${JSON.stringify(manifest, null, 2)}\n`
}
