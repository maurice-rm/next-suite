export type AnswerValue = string | boolean | string[]

/** A plugin the answers select, with the category it was chosen in. */
type SelectedPlugin = {
  name: string
  category: string | undefined
}

/** Answers while they are being resolved, question by question. */
export type WorkingAnswers = {
  plugins: SelectedPlugin[]
  settings: Record<string, AnswerValue>
  options: Record<string, AnswerValue>
}

/**
 * Everything a run decided: the selected plugins, the base settings and the plugin options, the
 * latter keyed `<plugin>.<option>`.
 */
export type Answers = { readonly [Key in keyof WorkingAnswers]: Readonly<WorkingAnswers[Key]> }

/** Answers as answer files and flags give them, and a project's config yields them, keyed by question key. */
export type AnswerInput = Readonly<Record<string, unknown>>

export const isSelected = (answers: Pick<Answers, 'plugins'>, name: string): boolean =>
  answers.plugins.some((plugin) => plugin.name === name)
