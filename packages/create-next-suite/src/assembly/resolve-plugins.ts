import type { Plugin } from '../plugin-definition/plugin-definition.ts'
import { isOptionalUse, pointOf } from '../plugin-definition/used-point.ts'
import { AssemblyError } from './assembly-error.ts'
import type { LoadedPlugin } from './loaded-plugin.ts'

type ResolveInput = {
  /** The selected plugins in the order they were selected. */
  plugins: readonly LoadedPlugin[]
  /** The categories in the order the wizard asks them. */
  categoryOrder: readonly string[]
}

/** The plugins that run, in the order they run, and the plugin that provides each point. */
export type ResolvedPlugins = {
  plugins: LoadedPlugin[]
  providers: ReadonlyMap<string, string>
}

/** The selected plugins without the ones a selected plugin replaces. */
const dropReplaced = (plugins: readonly LoadedPlugin[]): LoadedPlugin[] => {
  const replaced = new Set(plugins.map(({ plugin }) => plugin.replaces))
  return plugins.filter(({ plugin }) => !replaced.has(plugin.name))
}

const assertNoConflicts = (plugins: readonly LoadedPlugin[]): void => {
  const names = new Set(plugins.map(({ plugin }) => plugin.name))
  for (const { plugin } of plugins) {
    for (const [other, reason] of Object.entries(plugin.conflicts ?? {})) {
      if (names.has(other)) {
        throw new AssemblyError(`${plugin.name} conflicts with ${other}: ${reason}`)
      }
    }
  }
}

const providedPoints = (plugin: Plugin): string[] => [
  ...Object.keys(plugin.provides ?? {}),
  ...Object.keys(plugin.collects ?? {}),
]

const findProviders = (plugins: readonly LoadedPlugin[]): Map<string, string> => {
  const providers = new Map<string, string>()
  for (const { plugin } of plugins) {
    for (const point of providedPoints(plugin)) {
      const other = providers.get(point)
      if (other !== undefined) {
        throw new AssemblyError(`Both ${other} and ${plugin.name} provide the point "${point}"`)
      }
      providers.set(point, plugin.name)
    }
  }
  return providers
}

/** The plugins whose points `plugin` uses; a required point without a provider is an error. */
const findProvidersOf = (plugin: Plugin, providers: ReadonlyMap<string, string>): Set<string> => {
  const found = new Set<string>()
  for (const used of Object.values(plugin.uses ?? {})) {
    const { name } = pointOf(used)
    const provider = providers.get(name)
    if (provider === plugin.name) {
      throw new AssemblyError(`${plugin.name} uses the point "${name}", which it provides itself`)
    }
    if (provider !== undefined) {
      found.add(provider)
    } else if (!isOptionalUse(used)) {
      throw new AssemblyError(
        `${plugin.name} uses the point "${name}", which no selected plugin provides`,
      )
    }
  }
  return found
}

/** A chain of plugins that use each other's points, such as `a → b → a`. */
const findCycle = (waiting: ReadonlyMap<string, ReadonlySet<string>>): string[] => {
  const [start] = waiting.keys()
  const path: string[] = []
  for (let current = start; current !== undefined; ) {
    const seen = path.indexOf(current)
    if (seen !== -1) {
      return [...path.slice(seen), current]
    }
    path.push(current)
    current = [...(waiting.get(current) ?? [])].find((provider) => waiting.has(provider))
  }
  return path
}

/**
 * Every provider before the plugins that use its points; otherwise in category order, then in
 * selection order, extras and plugins of unknown categories last.
 */
const orderPlugins = (
  plugins: readonly LoadedPlugin[],
  {
    providers,
    categoryOrder,
  }: { providers: ReadonlyMap<string, string>; categoryOrder: readonly string[] },
): LoadedPlugin[] => {
  const rank = ({ plugin }: LoadedPlugin): number => {
    const index = plugin.category === undefined ? -1 : categoryOrder.indexOf(plugin.category)
    return index === -1 ? categoryOrder.length : index
  }
  const pending = [...plugins].sort((left, right) => rank(left) - rank(right))
  const waiting = new Map(
    pending.map(({ plugin }) => [plugin.name, findProvidersOf(plugin, providers)]),
  )
  const ordered: LoadedPlugin[] = []
  while (pending.length > 0) {
    const index = pending.findIndex(({ plugin }) =>
      [...(waiting.get(plugin.name) ?? [])].every((provider) => !waiting.has(provider)),
    )
    const [next] = index === -1 ? [] : pending.splice(index, 1)
    if (next === undefined) {
      throw new AssemblyError(
        `These plugins use each other's points: ${findCycle(waiting).join(' → ')}`,
      )
    }
    waiting.delete(next.plugin.name)
    ordered.push(next)
  }
  return ordered
}

/**
 * The plugins that run and their order. A replaced plugin is dropped first, so its replacement
 * provides its points; then conflicts, providers and the points each plugin uses are checked.
 *
 * @throws AssemblyError for a conflict, two providers of a point, a required point without a
 * provider, a plugin that uses its own point, and plugins that use each other's points.
 */
export const resolvePlugins = ({ plugins, categoryOrder }: ResolveInput): ResolvedPlugins => {
  const running = dropReplaced(plugins)
  assertNoConflicts(running)
  const providers = findProviders(running)
  return { plugins: orderPlugins(running, { providers, categoryOrder }), providers }
}
