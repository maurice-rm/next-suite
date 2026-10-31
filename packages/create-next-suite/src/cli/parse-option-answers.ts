import { InputError } from '../input-error.ts'
import { type Answer, choiceValue, type PluginOption } from '../plugin-definition/plugin-option.ts'

const OPTION_PREFIX = '--'
const NEGATION_PREFIX = '--no-'
const VALUE_SEPARATOR = '='
const LIST_SEPARATOR = ','

type PluginOptions = {
  plugin: string
  options: Readonly<Record<string, PluginOption>>
}

/** One option of the command line: its name and the value written with `=`, if any. */
type OptionToken = { name: string; inlineValue: string | undefined }

const readToken = (token: string, { options }: PluginOptions): OptionToken => {
  if (!token.startsWith(OPTION_PREFIX)) {
    const example = Object.keys(options)[0] ?? 'name'
    throw new InputError(`expected an option such as --${example}, not "${token}"`)
  }
  const [name = '', ...value] = token.slice(OPTION_PREFIX.length).split(VALUE_SEPARATOR)
  return {
    name,
    inlineValue: value.length === 0 ? undefined : value.join(VALUE_SEPARATOR),
  }
}

const toAnswer = (
  { name, value }: { name: string; value: string },
  option: PluginOption,
  plugin: string,
): Answer => {
  if (option.type === 'boolean') {
    if (value !== 'true' && value !== 'false') {
      throw new InputError(`${plugin} --${name} takes true or false, not "${value}"`)
    }
    return value === 'true'
  }
  const choices = option.choices.map(choiceValue)
  const values =
    option.type === 'multiselect' ? value.split(LIST_SEPARATOR).map((item) => item.trim()) : [value]
  const invalid = values.find((item) => !choices.includes(item))
  if (invalid !== undefined) {
    throw new InputError(`${plugin} --${name} takes one of ${choices.join(', ')}, not "${invalid}"`)
  }
  return option.type === 'multiselect' ? values : value
}

/** One option read from the arguments: its name, its answer and how many arguments it took. */
type ReadOption = { name: string; answer: Answer; taken: number }

const unknownOption = (name: string, { plugin, options }: PluginOptions): InputError => {
  const known = Object.keys(options).map((key) => `--${key}`)
  return new InputError(
    `${plugin} has no option --${name}; ${known.length === 0 ? 'it has no options' : `its options are ${known.join(', ')}`}`,
  )
}

/** Reads the option at `index`: `--no-<option>`, a boolean flag, `--option=value` or `--option value`. */
const readOption = (
  tokens: readonly string[],
  index: number,
  plugin: PluginOptions,
): ReadOption => {
  const token = tokens[index] ?? ''
  const negated = token.startsWith(NEGATION_PREFIX)
    ? token.slice(NEGATION_PREFIX.length)
    : undefined
  if (negated !== undefined && plugin.options[negated]?.type === 'boolean') {
    return { name: negated, answer: false, taken: 1 }
  }
  const { name, inlineValue } = readToken(token, plugin)
  const option = plugin.options[name]
  if (option === undefined) {
    throw unknownOption(name, plugin)
  }
  if (inlineValue !== undefined) {
    return { name, answer: toAnswer({ name, value: inlineValue }, option, plugin.plugin), taken: 1 }
  }
  if (option.type === 'boolean') {
    return { name, answer: true, taken: 1 }
  }
  const value = tokens[index + 1]
  if (value === undefined || value.startsWith(OPTION_PREFIX)) {
    throw new InputError(`${plugin.plugin} --${name} needs a value`)
  }
  return { name, answer: toAnswer({ name, value }, option, plugin.plugin), taken: 2 }
}

/**
 * The answers the arguments after `next-suite add <plugin>` give to the plugin's options:
 * `--option value` or `--option=value`, a list comma-separated, and a boolean option as
 * `--option` or `--no-option`.
 *
 * @throws InputError for an argument that is no option, an option the plugin does not have, a
 * missing value or a value that is none of the choices.
 */
export const parseOptionAnswers = (
  tokens: readonly string[],
  plugin: PluginOptions,
): Record<string, Answer> => {
  const answers: Record<string, Answer> = {}
  for (let index = 0; index < tokens.length; ) {
    const { name, answer, taken } = readOption(tokens, index, plugin)
    answers[name] = answer
    index += taken
  }
  return answers
}
