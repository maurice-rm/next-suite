import type { ModuleExport } from '../contract/contributions.ts'
import type { ParsedPluginManifest } from '../contract/plugin-manifest.ts'
import { ComposeError } from './compose-error.ts'
import { collect, uniqueBy } from './merge-entries.ts'

type Contributions = NonNullable<ParsedPluginManifest['contributes']>

const moduleKey = ({ module, export: name }: ModuleExport): string => `${module}#${name ?? ''}`

/** The module exports every manifest contributes to one point, in plugin order, each once. */
export const mergeModuleExports = <Entry extends ModuleExport>(
  manifests: readonly ParsedPluginManifest[],
  pick: (contributes: Contributions) => readonly Entry[] | undefined,
): Entry[] =>
  uniqueBy(
    collect(manifests, ({ contributes }) => pick(contributes ?? {})),
    moduleKey,
  )

/** Fails when two modules share an export name, which would import the same binding twice. */
export const assertUniqueExports = <Entry extends ModuleExport>(
  point: string,
  entries: Entry[],
): Entry[] => {
  const modules = new Map<string, string>()
  for (const { module, export: name } of entries) {
    if (name === undefined) {
      continue
    }
    const existing = modules.get(name)
    if (existing !== undefined && existing !== module) {
      throw new ComposeError(`${existing} and ${module} both export "${name}" for ${point}`)
    }
    modules.set(name, module)
  }
  return entries
}
