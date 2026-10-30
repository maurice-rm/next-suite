import type { ProvenanceLog } from '../project-model/provenance.ts'
import { ProjectConfigError } from './project-config-error.ts'
import { PROJECT_PATHS } from './project-paths.ts'

const OVERRIDES_PREFIX = `${PROJECT_PATHS.overrides}/`
/** The name provenance records for the project's overrides. */
const OVERRIDE_WRITER = 'override'

/** A project's files by their path on disk, and which plugin did what to each. */
export type GeneratedFiles = { files: ReadonlyMap<string, string>; provenance: ProvenanceLog }

/**
 * The generated files with every override applied: a file under `next-suite/overrides/<path>`
 * replaces the generated file at `<path>` completely, after every plugin ran, and provenance
 * records it. The other project inputs are left alone.
 *
 * @param inputs - The project's inputs by project path, as `readProjectInputs` reads them.
 * @throws ProjectConfigError for an override of a path the project does not generate.
 */
export const applyOverrides = (
  generated: GeneratedFiles,
  inputs: ReadonlyMap<string, string>,
): GeneratedFiles => {
  const files = new Map(generated.files)
  const provenanceFiles = { ...generated.provenance.files }
  for (const [inputPath, content] of inputs) {
    if (!inputPath.startsWith(OVERRIDES_PREFIX)) {
      continue
    }
    const path = inputPath.slice(OVERRIDES_PREFIX.length)
    if (!files.has(path)) {
      throw new ProjectConfigError(
        `${inputPath} replaces ${path}, which the project does not generate; put a file of your own straight into the project`,
      )
    }
    files.set(path, content)
    provenanceFiles[path] = [
      ...(provenanceFiles[path] ?? []),
      { plugin: OVERRIDE_WRITER, operation: `replace with ${inputPath}`, kind: 'override' },
    ]
  }
  return { files, provenance: { ...generated.provenance, files: provenanceFiles } }
}
