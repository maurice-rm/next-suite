import type { Writable } from 'node:stream'

import type { StepReporter } from '../post-steps/run-post-steps.ts'
import { renderFrameLine } from '../ui/frame.ts'
import {
  renderCommandOutput,
  renderStepDone,
  renderStepFailed,
  renderStepNote,
  renderStepRunning,
} from '../ui/step-frame.ts'
import { SPINNER_FRAMES } from '../ui/theme.ts'
import type { Presenter } from './presenter.ts'

const SPINNER_INTERVAL_MS = 80
const OUTPUT_TAIL_LINES = 12
const CLEAR_LINE = '\r\u001b[2K'
const PLAIN_OUTPUT_INDENT = '  '

type ReporterOptions = {
  presenter: Presenter
  /** Whether the output is a terminal that can redraw a line, so a spinner shows the work. */
  canAnimate: boolean
}

const tailOf = (output: string): string[] =>
  output
    .trim()
    .split('\n')
    .filter((line) => line.trim() !== '')
    .slice(-OUTPUT_TAIL_LINES)

const asLines = (lines: readonly string[]): string => lines.map((line) => `${line}\n`).join('')

/** Draws the spinner beside a running step until the returned function stops and clears it. */
const startSpinner = (output: Writable, message: string): (() => void) => {
  let index = 0
  const draw = () => {
    const spinnerFrame = SPINNER_FRAMES[index % SPINNER_FRAMES.length] ?? ''
    output.write(`${CLEAR_LINE}${renderStepRunning(spinnerFrame, message)}`)
    index += 1
  }
  draw()
  const timer = setInterval(draw, SPINNER_INTERVAL_MS)
  return () => {
    clearInterval(timer)
    output.write(CLEAR_LINE)
  }
}

/**
 * Shows the steps after writing inside the wizard frame, with a spinner while a step runs, or as
 * plain lines for scripts and CI. A failed step shows the end of its command's output.
 */
export const createStepReporter = ({ presenter, canAnimate }: ReporterOptions): StepReporter => {
  const { output, error, isFramed } = presenter
  const openStep = (): void => {
    if (isFramed) {
      output.write(`${renderFrameLine('')}\n`)
    }
  }
  const showDone = (message: string): void => {
    output.write(asLines([isFramed ? renderStepDone(message) : message]))
  }
  const showFailed = (message: string, commandOutput: string): void => {
    const tail = tailOf(commandOutput)
    if (isFramed) {
      output.write(asLines([renderStepFailed(message), ...tail.map(renderCommandOutput)]))
      return
    }
    error.write(asLines([message, ...tail.map((line) => `${PLAIN_OUTPUT_INDENT}${line}`)]))
  }
  return {
    note: (message) => {
      openStep()
      if (isFramed) {
        output.write(asLines([renderStepNote(message)]))
        return
      }
      error.write(asLines([message]))
    },
    step: async (messages, action) => {
      openStep()
      const stopSpinner = isFramed && canAnimate ? startSpinner(output, messages.running) : () => {}
      const result = await action().finally(stopSpinner)
      if (result.isSuccess) {
        showDone(messages.done)
      } else {
        showFailed(messages.failed, result.output)
      }
      return result.isSuccess
    },
  }
}
