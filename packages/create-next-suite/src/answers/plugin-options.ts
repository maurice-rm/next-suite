import type { Answers, AnswerValue } from './answers.ts'

/** The answers to one plugin's options, keyed by option name without the plugin prefix. */
export const optionsOf = (pluginName: string, answers: Answers): Record<string, AnswerValue> => {
  const prefix = `${pluginName}.`
  return Object.fromEntries(
    Object.entries(answers.options)
      .filter(([key]) => key.startsWith(prefix))
      .map(([key, value]) => [key.slice(prefix.length), value]),
  )
}
