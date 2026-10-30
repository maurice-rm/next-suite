import { CORE_OWNER, type Project } from '../project-model/project.ts'
import type { ProvenanceLog } from '../project-model/provenance.ts'
import { applyBaseSettings, type BaseSettings } from './apply-base-settings.ts'
import type { LoadedPlugin } from './loaded-plugin.ts'
import { createPluginRun, type PluginRun, type PointState } from './plugin-run.ts'
import type { PluginAnswers } from './resolve-answers.ts'
import { resolvePlugins } from './resolve-plugins.ts'
import { collectRunSteps, type RunSteps } from './run-steps.ts'

export type AssemblyInput = {
  /** The project over the base files, with its settings. */
  project: Project
  /** The selected plugins in the order they were selected. */
  plugins: readonly LoadedPlugin[]
  /** The categories in the order the wizard asks them. */
  categoryOrder: readonly string[]
  /** The answers by plugin name; an option without an answer takes its default. */
  answers?: Readonly<Record<string, PluginAnswers>>
  /** The settings the core applies to the base files before the plugins run. */
  baseSettings?: BaseSettings
}

export type AssembledProject = {
  /** Every file by its path on disk, sorted by path. */
  files: Map<string, string>
  /** Who wrote each file: `base`, a plugin, or `core` for a file only the core writes. */
  owners: Map<string, string>
  /** Which plugin did what to which file and point. */
  provenance: ProvenanceLog
  /** What the plugins state for the end of the run: stack, next steps and post-steps. */
  runSteps: RunSteps
}

/**
 * Assembles the project from the selected plugins. The plugins are resolved first (replacements,
 * conflicts, providers, order) and the base settings applied; then every phase runs for all
 * plugins in order before the next one, `.gitignore` getting the generated directories after
 * collecting: collect, extend, own file edits, finishing the collector points, direct edits. The scripts
 * the plugins' next steps and post-steps name are checked, and the project is printed last.
 *
 * @throws AssemblyError when the plugins cannot run together, a plugin's step fails, or a next
 * step or post-step names a script the project lacks.
 * @throws ProjectError when the project cannot take a change, such as a second owner of a file.
 */
export const assembleProject = ({
  project,
  plugins,
  categoryOrder,
  answers = {},
  baseSettings,
}: AssemblyInput): AssembledProject => {
  const resolved = resolvePlugins({ plugins, categoryOrder })
  const running = new Set(resolved.plugins.map(({ plugin }) => plugin.name))
  const points: PointState = {
    providers: resolved.providers,
    values: new Map(),
    collectors: new Map(),
  }
  project.provenance.recordOrder([...running])
  for (const [point, provider] of resolved.providers) {
    project.provenance.recordProvider(point, provider)
  }
  if (baseSettings !== undefined) {
    const categories = resolved.plugins.flatMap(({ plugin }) => plugin.category ?? [])
    applyBaseSettings(project, baseSettings, new Set(categories))
  }
  const generatedDirectories: string[] = []
  const runs = resolved.plugins.map((loaded) =>
    createPluginRun(loaded, {
      project,
      points,
      running,
      answers: answers[loaded.plugin.name],
      generatedDirectories,
    }),
  )
  const runPhase = (phase: (run: PluginRun) => void): void => {
    for (const run of runs) {
      phase(run)
    }
  }

  runPhase((run) => run.collect())
  for (const directory of generatedDirectories) {
    project.gitignore().add(`/${directory}`)
  }
  const wrappers = runs.flatMap((run) => run.layoutWrapper() ?? [])
  if (wrappers.length > 0) {
    project.layout().wrapChildren(wrappers)
  }
  runPhase((run) => run.extend())
  runPhase((run) => run.editOwnFiles())
  runPhase((run) => run.finishCollectors())
  runPhase((run) => run.editOtherFiles())

  const runSteps = collectRunSteps(
    runs.map((run) => run.runSteps()),
    () => project.packageJson().scripts(),
  )
  const files = project.print()
  const owners = new Map(
    [...files.keys()].map((path) => [path, project.ownerOf(path) ?? CORE_OWNER]),
  )
  return { files, owners, provenance: project.provenance.toJson(), runSteps }
}
