import type { Plugin } from '../plugin-definition/plugin-definition.ts'
import type { Answer } from '../plugin-definition/plugin-option.ts'
import type { GeneratedFiles } from './apply-overrides.ts'
import {
  hashFileContent,
  type LockedPlugin,
  type LockedProject,
  type LockFile,
  renderLockFile,
} from './lock-file.ts'
import { CLI_PACKAGE, PROJECT_PATHS } from './project-paths.ts'
import { renderRegistryTypes } from './render-registry-types.ts'

/** What a generation ran with and wrote, for the lock and the registry types. */
export type Generation = {
  generatorVersion: string
  project: LockedProject
  plugins: readonly LockedPlugin[]
  disable: readonly string[]
  /** Every answer by plugin and option, defaults included. */
  answers: Readonly<Record<string, Readonly<Record<string, Answer>>>>
  /** The generated files, overrides applied, without the project's config and inputs. */
  generated: GeneratedFiles
  /** Every plugin the project's config can name. */
  availablePlugins: readonly Pick<Plugin, 'name' | 'options'>[]
}

const lockOf = (generation: Generation): LockFile => ({
  generator: { name: CLI_PACKAGE, version: generation.generatorVersion },
  project: generation.project,
  plugins: [...generation.plugins],
  disable: [...generation.disable],
  answers: Object.fromEntries(
    Object.entries(generation.answers)
      .filter(([, options]) => Object.keys(options).length > 0)
      .map(([plugin, options]) => [
        plugin,
        Object.fromEntries(
          Object.entries(options).map(([key, answer]) => [
            key,
            typeof answer === 'object' ? [...answer] : answer,
          ]),
        ),
      ]),
  ),
  files: Object.fromEntries(
    [...generation.generated.files]
      .sort(([left], [right]) => (left < right ? -1 : 1))
      .map(([path, content]) => [path, hashFileContent(content)]),
  ),
  provenance: generation.generated.provenance,
})

/**
 * The files create-next-suite writes into `.next-suite/` on every generation: the lock, which
 * records what ran and a hash of every generated file, and the registry types, which let the
 * project's config check plugin names and answers.
 */
export const describeGeneration = (generation: Generation): Map<string, string> =>
  new Map([
    [PROJECT_PATHS.lock, renderLockFile(lockOf(generation))],
    [PROJECT_PATHS.registryTypes, renderRegistryTypes(generation.availablePlugins)],
  ])
