import type { Readable, Writable } from 'node:stream'

import {
  ConfirmPrompt,
  isCancel,
  MultiSelectPrompt,
  type Prompt,
  SelectPrompt,
  TextPrompt,
} from '@clack/core'
import ansis from 'ansis'

import {
  pick,
  renderEnd,
  renderFooter,
  renderLine,
  renderPromptTitle,
  renderResolved,
  SYMBOLS,
} from '../ui/theme.ts'

/** Returned when the user goes back one question with `b` or Esc. */
export const GO_BACK: unique symbol = Symbol('go-back')

/** Thrown when the user cancels the wizard with Ctrl+C. */
export class WizardCancelled extends Error {
  constructor() {
    super('create-next-suite: cancelled')
    this.name = 'WizardCancelled'
  }
}

export type Choice<Value> = { value: Value; label: string; hint?: string; disabled?: boolean }

/** Where prompts read keys and render to; the terminal in the CLI, streams in tests. */
export type Streams = { input: Readable; output: Writable }

type PromptBase = Streams & { message: string; canGoBack: boolean }

type RunMode = { isTyping: boolean; canGoBack: boolean }

const BACK_KEY = 'b'
const ESCAPE = 'escape'

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
    throw new WizardCancelled()
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
      const footer = renderFooter(LIST_KEYS, { key: BACK_KEY, isPossible: options.canGoBack })
      return `${renderPromptTitle(this.state, options.message)}${lines.join('\n')}\n${renderEnd(footer)}`
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
          labels.length > 0 ? labels.join(', ') : 'none',
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
      const footer = renderFooter(MULTISELECT_KEYS, {
        key: BACK_KEY,
        isPossible: options.canGoBack,
      })
      return `${renderPromptTitle(this.state, options.message)}${lines.join('\n')}\n${renderEnd(footer)}`
    },
  })
  return run(prompt, { isTyping: false, canGoBack: options.canGoBack })
}

export const confirm = async (
  options: PromptBase & { initialValue: boolean },
): Promise<boolean | typeof GO_BACK> => {
  const prompt = new ConfirmPrompt({
    active: 'Yes',
    inactive: 'No',
    initialValue: options.initialValue,
    input: options.input,
    output: options.output,
    render() {
      if (isDone(this.state)) {
        return renderResolved(this.state, options.message, this.value ? 'Yes' : 'No')
      }
      const yes = this.value ? `${pick(SYMBOLS.radioOn)} Yes` : ansis.dim(`${SYMBOLS.radioOff} Yes`)
      const no = this.value ? ansis.dim(`${SYMBOLS.radioOff} No`) : `${pick(SYMBOLS.radioOn)} No`
      const footer = renderFooter(CONFIRM_KEYS, { key: BACK_KEY, isPossible: options.canGoBack })
      return `${renderPromptTitle(this.state, options.message)}${renderLine(`${yes} ${ansis.dim('/')} ${no}`)}\n${renderEnd(footer)}`
    },
  })
  return run(prompt, { isTyping: false, canGoBack: options.canGoBack })
}

export const text = async (
  options: PromptBase & { defaultValue: string; validate?: (value: string) => string | undefined },
): Promise<string | typeof GO_BACK> => {
  const prompt = new TextPrompt({
    defaultValue: options.defaultValue,
    placeholder: options.defaultValue,
    validate:
      options.validate === undefined
        ? undefined
        : (value) => options.validate?.(value || options.defaultValue),
    input: options.input,
    output: options.output,
    render() {
      if (isDone(this.state)) {
        return renderResolved(this.state, options.message, this.value || options.defaultValue)
      }
      const value =
        this.userInput === '' ? renderPlaceholder(options.defaultValue) : this.userInputWithCursor
      const error = this.state === 'error' ? `\n${renderLine(ansis.yellow(this.error))}` : ''
      const footer = renderFooter(TEXT_KEYS, { key: 'esc', isPossible: options.canGoBack })
      return `${renderPromptTitle(this.state, options.message)}${renderLine(value)}${error}\n${renderEnd(footer)}`
    },
  })
  const result = await run(prompt, { isTyping: true, canGoBack: options.canGoBack })
  return result === GO_BACK ? GO_BACK : result || options.defaultValue
}
