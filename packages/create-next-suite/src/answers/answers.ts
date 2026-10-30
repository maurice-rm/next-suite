export type AnswerValue = string | number | boolean | string[]

type SelectedPlugin = {
  name: string
  category: string | undefined
}

/**
 * Everything a run decided: the selected plugins, the base settings and the plugin options, the
 * latter keyed `<plugin>.<option>`.
 */
export type Answers = {
  plugins: readonly SelectedPlugin[]
  settings: Readonly<Record<string, AnswerValue>>
  options: Readonly<Record<string, AnswerValue>>
}

/** Whether the answers select the plugin of this name. */
export const isSelected = (answers: Pick<Answers, 'plugins'>, name: string): boolean =>
  answers.plugins.some((plugin) => plugin.name === name)
