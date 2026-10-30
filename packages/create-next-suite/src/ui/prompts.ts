import type { Readable, Writable } from 'node:stream'

import {
  ConfirmPrompt,
  isCancel,
  MultiSelectPrompt,
  type Prompt,
  SelectPrompt,
  type State,
  TextPrompt,
} from '@clack/core'
import ansis from 'ansis'

import { PromptCancelledError } from './prompt-cancelled-error.ts'
import {
  pick,
  renderEnd,
  renderFooter,
  renderLine,
  renderPromptTitle,
  renderResolved,
  SYMBOLS,
} from './theme.ts'

/** Where prompts read keys and render to; the terminal in the CLI, streams in tests. */
export type Streams = { input: Readable; output: Writable }

/** Returned when the user goes back one question with `b` or Esc. */
export const GO_BACK: unique symbol = Symbol('go-back')

export type Choice<Value> = { value: Value; label: string; hint?: string; disabled?: boolean }

export type PromptBase = Streams & { message: string; canGoBack: boolean }

type RunMode = { isTyping: boolean; canGoBack: boolean }

const BACK_KEY = 'b'
const ESCAPE = 'escape'
const ESCAPE_HINT = 'esc'
const YES_LABEL = 'Yes'
const NO_LABEL = 'No'
const NONE_LABEL = 'none'

const LIST_KEYS: [string, string][] = [
  ['↑/↓', 'navigate'],
  ['enter', 'confirm'],
]
const MULTISELECT_KEYS: [string, string][] = [
  ['↑/↓', 'navigate'],
  ['space', 'toggle'],
  ['enter', 'confirm'],
]
const CONFIRM_KEYS: [string, string][] = [
  ['←/→', 'toggle'],
  ['y/n', 'select'],
  ['enter', 'confirm'],
]
const TEXT_KEYS: [string, string][] = [['enter', 'confirm']]

/** The default shown in an empty text field, with the cursor on its first character. */
const renderPlaceholder = (placeholder: string): string =>
  placeholder === ''
    ? ansis.inverse(' ')
    : ansis.inverse(placeholder.slice(0, 1)) + ansis.dim(placeholder.slice(1))

const isDone = (state: string): boolean => state === 'submit' || state === 'cancel'

type OpenPrompt = {
  state: State
  options: PromptBase
  body: string
  keys: [string, string][]
  backKey: string
}

/** A prompt waiting for input: its title, its body and the keys it takes under it. */
const renderOpenPrompt = ({ state, options, body, keys, backKey }: OpenPrompt): string => {
  const footer = renderFooter(keys, { key: backKey, isPossible: options.canGoBack })
  return `${renderPromptTitle(state, options.message)}${body}\n${renderEnd(footer)}`
}

/**
 * Runs a prompt. Where going back is possible, `b` (unless typing) or Esc goes back; Ctrl+C
 * cancels, and so does Esc on a question without a way back.
 */
const run = async <Value>(
  prompt: Prompt<Value>,
  { isTyping, canGoBack }: RunMode,
): Promise<Value | typeof GO_BACK> => {
  let isBack = false
  prompt.on('key', (character, key) => {
    if (canGoBack && (key.name === ESCAPE || (!isTyping && character === BACK_KEY))) {
      isBack = true
      prompt.state = 'cancel'
    }
  })
  const result = await prompt.prompt()
  if (isBack) {
    return GO_BACK
  }
  if (isCancel(result) || result === undefined) {
    throw new PromptCancelledError()
  }
  return result
}

const renderChoice = <Value>(choice: Choice<Value>, marker: string, isActive: boolean): string => {
  const label = choice.disabled
    ? ansis.strikethrough(ansis.dim(choice.label))
    : isActive
      ? choice.label
      : ansis.dim(choice.label)
  const hint = choice.hint === undefined ? '' : ` ${ansis.dim(`(${choice.hint})`)}`
  return renderLine(`${marker} ${label}${hint}`)
}

export const select = async <Value>(
  options: PromptBase & { choices: Choice<Value>[]; initialValue: Value },
): Promise<Value | typeof GO_BACK> => {
  const prompt = new SelectPrompt({
    options: options.choices,
    initialValue: options.initialValue,
    input: options.input,
    output: options.output,
    render() {
      if (isDone(this.state)) {
        return renderResolved(
          this.state,
          options.message,
          options.choices[this.cursor]?.label ?? '',
        )
      }
      const lines = options.choices.map((choice, index) =>
        renderChoice(
          choice,
          index === this.cursor ? pick(SYMBOLS.radioOn) : ansis.dim(SYMBOLS.radioOff),
          index === this.cursor,
        ),
      )
      return renderOpenPrompt({
        state: this.state,
        options,
        body: lines.join('\n'),
        keys: LIST_KEYS,
        backKey: BACK_KEY,
      })
    },
  })
  return run(prompt, { isTyping: false, canGoBack: options.canGoBack })
}

export const multiselect = async <Value>(
  options: PromptBase & { choices: Choice<Value>[]; initialValues: Value[] },
): Promise<Value[] | typeof GO_BACK> => {
  const prompt = new MultiSelectPrompt({
    options: options.choices,
    initialValues: options.initialValues,
    required: false,
    input: options.input,
    output: options.output,
    render() {
      const selected = this.value ?? []
      if (isDone(this.state)) {
        const labels = options.choices
          .filter((choice) => selected.includes(choice.value))
          .map((choice) => choice.label)
        return renderResolved(
          this.state,
          options.message,
          labels.length > 0 ? labels.join(', ') : NONE_LABEL,
        )
      }
      const lines = options.choices.map((choice, index) =>
        renderChoice(
          choice,
          selected.includes(choice.value)
            ? pick(SYMBOLS.checkboxOn)
            : ansis.dim(SYMBOLS.checkboxOff),
          index === this.cursor,
        ),
      )
      return renderOpenPrompt({
        state: this.state,
        options,
        body: lines.join('\n'),
        keys: MULTISELECT_KEYS,
        backKey: BACK_KEY,
      })
    },
  })
  return run(prompt, { isTyping: false, canGoBack: options.canGoBack })
}

export const confirm = async (
  options: PromptBase & { initialValue: boolean },
): Promise<boolean | typeof GO_BACK> => {
  const prompt = new ConfirmPrompt({
    active: YES_LABEL,
    inactive: NO_LABEL,
    initialValue: options.initialValue,
    input: options.input,
    output: options.output,
    render() {
      if (isDone(this.state)) {
        return renderResolved(this.state, options.message, this.value ? YES_LABEL : NO_LABEL)
      }
      const on = `${pick(SYMBOLS.radioOn)} `
      const off = `${SYMBOLS.radioOff} `
      const yes = this.value ? `${on}${YES_LABEL}` : ansis.dim(`${off}${YES_LABEL}`)
      const no = this.value ? ansis.dim(`${off}${NO_LABEL}`) : `${on}${NO_LABEL}`
      return renderOpenPrompt({
        state: this.state,
        options,
        body: renderLine(`${yes} ${ansis.dim('/')} ${no}`),
        keys: CONFIRM_KEYS,
        backKey: BACK_KEY,
      })
    },
  })
  return run(prompt, { isTyping: false, canGoBack: options.canGoBack })
}

type TextOptions = PromptBase & {
  /** The answer when the field is left empty; shown as the placeholder unless one is given. */
  defaultValue?: string
  placeholder?: string
  /** Text already in the field, such as the answer given before going back. */
  initialValue?: string | undefined
  validate?: (value: string) => string | undefined
}

export const text = async (options: TextOptions): Promise<string | typeof GO_BACK> => {
  const fallback = options.defaultValue ?? ''
  const placeholder = options.placeholder ?? fallback
  const prompt = new TextPrompt({
    defaultValue: fallback,
    placeholder,
    ...(options.initialValue === undefined ? {} : { initialUserInput: options.initialValue }),
    validate:
      options.validate === undefined ? undefined : (value) => options.validate?.(value || fallback),
    input: options.input,
    output: options.output,
    render() {
      if (isDone(this.state)) {
        return renderResolved(this.state, options.message, this.value || fallback)
      }
      const value =
        this.userInput === '' ? renderPlaceholder(placeholder) : this.userInputWithCursor
      const error = this.state === 'error' ? `\n${renderLine(ansis.yellow(this.error))}` : ''
      return renderOpenPrompt({
        state: this.state,
        options,
        body: `${renderLine(value)}${error}`,
        keys: TEXT_KEYS,
        backKey: ESCAPE_HINT,
      })
    },
  })
  const result = await run(prompt, { isTyping: true, canGoBack: options.canGoBack })
  return result === GO_BACK ? GO_BACK : result || fallback
}
