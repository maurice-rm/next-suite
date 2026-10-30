import type { AnswerInput } from '../answers/answers.ts'
import type { Category } from '../plugin-definition/categories.ts'
import type { Plugin } from '../plugin-definition/plugin-definition.ts'
import { ProjectConfigError } from './project-config-error.ts'
import { PROJECT_PATHS } from './project-paths.ts'
import type { ProjectSettings, SuiteConfig } from './suite-config.ts'

/** The base setting each project setting of the config answers. */
const SETTING_KEYS = {
  srcDir: 'src-dir',
  importAlias: 'import-alias',
  reactCompiler: 'react-compiler',
  cacheComponents: 'cache-components',
} as const satisfies Record<Exclude<keyof ProjectSettings, 'name'>, string>

type ConfigPlugins = {
  /** Every plugin the run knows: built-in, external and defined in the config. */
  plugins: readonly Plugin[]
  categories: readonly Category[]
  /** The name of the plugin an address or path of the config loaded, if one did. */
  nameOfEntry: (entry: string) => string | undefined
}

const CONFIG = PROJECT_PATHS.config

const nameOf = (entry: SuiteConfig['plugins'][number], known: ConfigPlugins): string => {
  if (typeof entry !== 'string') {
    return entry.name
  }
  const name = known.nameOfEntry(entry) ?? entry
  if (!known.plugins.some((plugin) => plugin.name === name)) {
    throw new ProjectConfigError(
      `${CONFIG} names the plugin "${entry}", which is no built-in plugin; name a plugin of your own by its path, such as "./${PROJECT_PATHS.plugins}/${entry}", or by its address`,
    )
  }
  return name
}

const selectedNames = (config: SuiteConfig, known: ConfigPlugins): Set<string> => {
  const selected = new Set(config.plugins.map((entry) => nameOf(entry, known)))
  for (const name of config.disable ?? []) {
    if (!known.plugins.some((plugin) => plugin.name === name)) {
      throw new ProjectConfigError(`${CONFIG} disables "${name}", which is no plugin`)
    }
    selected.delete(name)
  }
  return selected
}

/** The answer of a category: the selected plugin, null or the list; nothing for a default. */
const categoryAnswer = (category: Category, names: readonly string[]): unknown => {
  if (category.cardinality === 'many') {
    return names
  }
  if (names.length > 1) {
    throw new ProjectConfigError(
      `${CONFIG} selects ${names.join(' and ')}, but the category ${category.id} takes one`,
    )
  }
  if (category.cardinality === 'one') {
    return names[0]
  }
  return names[0] ?? null
}

const optionAnswers = (config: SuiteConfig, selected: ReadonlySet<string>): AnswerInput =>
  Object.fromEntries(
    Object.entries(config.answers ?? {}).flatMap(([plugin, options]) => {
      if (!selected.has(plugin)) {
        throw new ProjectConfigError(`${CONFIG} answers ${plugin}, which it does not select`)
      }
      return Object.entries(options ?? {}).map(([option, value]) => [`${plugin}.${option}`, value])
    }),
  )

const settingAnswers = ({ project }: SuiteConfig): AnswerInput =>
  Object.fromEntries(
    Object.entries(SETTING_KEYS).flatMap(([field, key]) => {
      const value = project[field as keyof typeof SETTING_KEYS]
      return value === undefined ? [] : [[key, value]]
    }),
  )

/**
 * The answers a config gives, keyed by question like an answer file: every category with the
 * plugins it selects, every extra as true or false, the answers to options and the settings it
 * sets. A disabled plugin counts as not selected; a category of exactly one plugin the config
 * leaves empty takes its default.
 *
 * @throws ProjectConfigError for a plugin or disabled plugin it does not know, two plugins of a
 * category that takes one, or answers to a plugin it does not select.
 */
export const answersOfConfig = (config: SuiteConfig, known: ConfigPlugins): AnswerInput => {
  const selected = selectedNames(config, known)
  const isSelected = (plugin: Plugin): boolean => selected.has(plugin.name)
  const categories = known.categories.flatMap((category) => {
    const names = known.plugins
      .filter((plugin) => plugin.category === category.id && isSelected(plugin))
      .map((plugin) => plugin.name)
    const answer = categoryAnswer(category, names)
    return answer === undefined ? [] : [[category.id, answer] as const]
  })
  const extras = known.plugins
    .filter((plugin) => plugin.category === undefined)
    .map((plugin) => [plugin.name, isSelected(plugin)] as const)
  return {
    ...Object.fromEntries([...categories, ...extras]),
    ...optionAnswers(config, selected),
    ...settingAnswers(config),
  }
}
