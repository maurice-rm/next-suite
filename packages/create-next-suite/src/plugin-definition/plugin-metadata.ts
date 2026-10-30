import type { Plugin } from './plugin-definition.ts'

/** The fields of a plugin's metadata that the questions read. */
export const METADATA_FIELDS = [
  'name',
  'title',
  'description',
  'category',
  'section',
  'replaces',
  'conflicts',
  'options',
] as const

/** The fields of a plugin that name points, read by their keys. */
export const POINT_FIELDS = ['uses', 'provides', 'collects', 'extend'] as const

/**
 * What a plugin is and asks, written as fixed values in `plugin.ts`, so the core can read it
 * without running the plugin.
 */
export type PluginMetadata = Pick<Plugin, (typeof METADATA_FIELDS)[number]>

type PointField = (typeof POINT_FIELDS)[number]

/** The names of the points a plugin uses, provides, collects and extends, by field. */
export type PluginPointNames = Readonly<Record<PointField, readonly string[]>>

/** The point names of each field, as `namesOf` answers them. */
export const pointNamesOf = (
  namesOf: (field: PointField) => readonly string[],
): PluginPointNames => ({
  uses: namesOf('uses'),
  provides: namesOf('provides'),
  collects: namesOf('collects'),
  extend: namesOf('extend'),
})

/** A plugin's metadata and the names of its points. */
export type PluginSummary = {
  metadata: PluginMetadata
  points: PluginPointNames
}

/** The metadata and point names of a plugin that has run; absent fields stay absent. */
export const summarizePlugin = (plugin: Plugin): PluginSummary => {
  const metadata = Object.fromEntries(
    METADATA_FIELDS.flatMap((field) =>
      plugin[field] === undefined ? [] : [[field, plugin[field]]],
    ),
  ) as PluginMetadata
  return { metadata, points: pointNamesOf((field) => Object.keys(plugin[field] ?? {})) }
}
