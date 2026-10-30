import { InputError } from '../input-error.ts'
import type { Category } from '../plugin-definition/categories.ts'
import type { Plugin } from '../plugin-definition/plugin-definition.ts'
import { PROJECT_SECTION, type Setting } from './base-settings.ts'
import { type QuestionOption, questionOptionOf } from './question-option.ts'
import { SETUP_SECTION } from './run-settings.ts'

type QuestionPlace = {
  key: string
  section: string | undefined
  /** Asked before the quick start: a category that needs exactly one plugin, and its options. */
  isEssential: boolean
}

/** One question of a run, with the key its answer has in answer files and next-suite.json. */
export type Question = QuestionPlace &
  (
    | { kind: 'category'; category: Category; choices: Plugin[] }
    | { kind: 'extra'; plugin: Plugin }
    | { kind: 'option'; plugin: Plugin; optionKey: string; option: QuestionOption }
    | { kind: 'setting'; option: QuestionOption; scope: SettingScope }
  )

/** Whether a setting is a base setting, recorded in next-suite.json, or a run setting. */
export type SettingScope = 'base' | 'run'

export type CategoryQuestion = Extract<Question, { kind: 'category' }>

type QuestionSources = {
  categories: readonly Category[]
  plugins: readonly Plugin[]
  settings: readonly Setting[]
  runSettings: readonly Setting[]
}

const optionQuestions = (plugin: Plugin, place: Omit<QuestionPlace, 'key'>): Question[] =>
  Object.entries(plugin.options ?? {}).map(([optionKey, option]) => ({
    kind: 'option',
    key: `${plugin.name}.${optionKey}`,
    plugin,
    optionKey,
    option: questionOptionOf(option),
    ...place,
  }))

const defaultNames = (category: Category): string[] => {
  if (category.cardinality === 'many') {
    return category.default
  }
  return category.default === null ? [] : [category.default]
}

/** The plugins of a category in the order it lists them, the others after them as loaded. */
const inCategoryOrder = (category: Category, plugins: readonly Plugin[]): Plugin[] => {
  const order = category.order ?? []
  const rank = (plugin: Plugin): number => {
    const index = order.indexOf(plugin.name)
    return index === -1 ? order.length : index
  }
  return plugins
    .filter((plugin) => plugin.category === category.id)
    .sort((first, second) => rank(first) - rank(second))
}

const categoryQuestion = (category: Category, plugins: readonly Plugin[]): CategoryQuestion => {
  const choices = inCategoryOrder(category, plugins)
  if (choices.length === 0 && category.cardinality === 'one') {
    throw new InputError(
      `the category ${category.id} needs exactly one plugin, but no plugin belongs to it`,
    )
  }
  for (const name of defaultNames(category)) {
    if (!choices.some((plugin) => plugin.name === name)) {
      throw new InputError(
        `the default ${name} of the category ${category.id} is not a plugin of that category`,
      )
    }
  }
  return {
    kind: 'category',
    key: category.id,
    section: category.section,
    isEssential: category.cardinality === 'one',
    category,
    choices,
  }
}

const withOptions = (question: CategoryQuestion): Question[] => [
  question,
  ...question.choices.flatMap((plugin) =>
    optionQuestions(plugin, { section: question.section, isEssential: question.isEssential }),
  ),
]

const assertKnownCategories = (
  categories: readonly Category[],
  plugins: readonly Plugin[],
): void => {
  for (const plugin of plugins) {
    if (
      plugin.category !== undefined &&
      !categories.some((category) => category.id === plugin.category)
    ) {
      throw new InputError(
        `the plugin ${plugin.name} belongs to the unknown category ${plugin.category}`,
      )
    }
  }
}

const settingQuestion = (
  setting: Setting,
  place: { section: string; scope: SettingScope },
): Question => ({
  kind: 'setting',
  key: setting.key,
  isEssential: false,
  option: setting.option,
  ...place,
})

/**
 * Orders every question of a run: the categories that need exactly one plugin, then the base
 * settings, then the other categories, each with the options of its plugins, then the extras
 * (plugins without a category) with their options, then the settings of the run. Each question
 * carries the section of the wizard it belongs to.
 */
export const buildQuestions = ({
  categories,
  plugins,
  settings,
  runSettings,
}: QuestionSources): Question[] => {
  assertKnownCategories(categories, plugins)
  const categoryQuestions = categories
    .map((category) => categoryQuestion(category, plugins))
    .filter((question) => question.choices.length > 0)
  const essential = categoryQuestions
    .filter((question) => question.isEssential)
    .flatMap(withOptions)
  const others = categoryQuestions.filter((question) => !question.isEssential).flatMap(withOptions)
  const settingQuestions = settings.map((setting) =>
    settingQuestion(setting, { section: PROJECT_SECTION, scope: 'base' }),
  )
  const runQuestions = runSettings.map((setting) =>
    settingQuestion(setting, { section: SETUP_SECTION, scope: 'run' }),
  )
  const extras = plugins
    .filter((plugin) => plugin.category === undefined)
    .flatMap((plugin): Question[] => [
      { kind: 'extra', key: plugin.name, section: plugin.section, isEssential: false, plugin },
      ...optionQuestions(plugin, { section: plugin.section, isEssential: false }),
    ])
  return [...essential, ...settingQuestions, ...others, ...extras, ...runQuestions]
}
