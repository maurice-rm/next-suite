import type { Plugin } from '../plugin-definition/plugin-definition.ts'
import { type Answer, choiceValue, type PluginOption } from '../plugin-definition/plugin-option.ts'
import { AssemblyError } from './assembly-error.ts'

/** Answers by option name, as given for one plugin. */
export type PluginAnswers = Readonly<Record<string, Answer>>

/** What an answer to `option` has to be, or nothing when `answer` is one. */
const describeExpected = (option: PluginOption, answer: Answer): string | undefined => {
  if (option.type === 'boolean') {
    return typeof answer === 'boolean' ? undefined : 'choose true or false'
  }
  const values = option.choices.map(choiceValue)
  if (option.type === 'multiselect') {
    const isValid =
      Array.isArray(answer) && answer.every((value: unknown) => values.includes(String(value)))
    return isValid ? undefined : `choose any of ${values.join(', ')}`
  }
  return typeof answer === 'string' && values.includes(answer)
    ? undefined
    : `choose one of ${values.join(', ')}`
}

/**
 * Each option's answer: the given one, checked against the option, or the default.
 *
 * @throws AssemblyError when an answer names an option the plugin does not have or is not one of
 * its choices.
 */
export const resolveAnswers = (plugin: Plugin, given: PluginAnswers = {}): PluginAnswers => {
  const options = plugin.options ?? {}
  for (const [key, answer] of Object.entries(given)) {
    const option = options[key]
    if (option === undefined) {
      throw new AssemblyError(`${plugin.name} has no option ${key}`)
    }
    const expected = describeExpected(option, answer)
    if (expected !== undefined) {
      throw new AssemblyError(
        `${JSON.stringify(answer)} is no answer to ${plugin.name}'s ${key}; ${expected}`,
      )
    }
  }
  return Object.fromEntries(
    Object.entries(options).map(([key, option]) => [key, given[key] ?? option.default]),
  )
}
