import { CONTRACT_VERSION, type ParsedPluginManifest } from '../../contract/plugin-manifest.ts'
import type { PluginOption as ContractOption } from '../../contract/plugin-option.ts'
import type { Plugin } from '../../plugin-definition/plugin-definition.ts'
import type { OptionChoice, PluginOption } from '../../plugin-definition/plugin-option.ts'
import { BUILT_IN_PLUGIN_VERSION } from './built-in-plugin-version.ts'

const toChoice = (choice: OptionChoice) =>
  typeof choice === 'string'
    ? { value: choice, label: choice }
    : {
        value: choice.value,
        label: choice.label ?? choice.value,
        ...(choice.description === undefined ? {} : { description: choice.description }),
      }

const toOption = (option: PluginOption): ContractOption => {
  const fields = {
    question: option.question,
    ...(option.description === undefined ? {} : { description: option.description }),
  }
  if (option.type === 'boolean') {
    return { ...fields, type: 'boolean', default: option.default }
  }
  const choices = option.choices.map(toChoice)
  return option.type === 'multiselect'
    ? { ...fields, type: 'multiselect', choices, default: [...option.default] }
    : { ...fields, type: 'select', choices, default: option.default }
}

/** The metadata of a plugin written as `plugin.ts`, in the form the questions read. */
const toQuestionManifest = (plugin: Plugin): ParsedPluginManifest => ({
  name: plugin.name,
  version: BUILT_IN_PLUGIN_VERSION,
  contract: CONTRACT_VERSION,
  title: plugin.title,
  description: plugin.description ?? plugin.title,
  ...(plugin.category === undefined ? {} : { category: plugin.category }),
  ...(plugin.section === undefined ? {} : { section: plugin.section }),
  options: Object.fromEntries(
    Object.entries(plugin.options ?? {}).map(([key, option]) => [key, toOption(option)]),
  ),
  conflicts: Object.entries(plugin.conflicts ?? {}).map(([other, reason]) => ({
    when: { plugin: other },
    reason,
  })),
})

/**
 * The plugins the questions offer with the engine of plugins written as `plugin.ts`: each
 * manifest plugin of the same name gives way to its `plugin.ts` form in its place, so the
 * questions, flags and answer files stay the same; a manifest plugin without one is still offered,
 * but cannot run on this engine.
 */
export const questionPlugins = (
  manifests: readonly ParsedPluginManifest[],
  plugins: readonly Plugin[],
): ParsedPluginManifest[] => {
  const byName = new Map(plugins.map((plugin) => [plugin.name, toQuestionManifest(plugin)]))
  const replaced = manifests.map((manifest) => byName.get(manifest.name) ?? manifest)
  const added = [...byName.values()].filter(
    (plugin) => !manifests.some((manifest) => manifest.name === plugin.name),
  )
  return [...replaced, ...added]
}
