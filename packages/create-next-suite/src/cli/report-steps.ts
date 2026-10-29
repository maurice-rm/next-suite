import type { Writable } from 'node:stream'

import type { StepReporter } from '../package-manager/run-post-steps.ts'
import {
  renderCommandOutput,
  renderFrameLine,
  renderStepResult,
  renderStepRunning,
  SPINNER_FRAMES,
} from '../ui/theme.ts'
import type { Presenter } from './present.ts'

const SPINNER_INTERVAL_MS = 80
const OUTPUT_TAIL_LINES = 12
const CLEAR_LINE = '\r\u001b[2K'
const PLAIN_OUTPUT_INDENT = '  '

const tailOf = (output: string): string[] =>
  output
    .trim()
    .split('\n')
    .filter((line) => line.trim() !== '')
    .slice(-OUTPUT_TAIL_LINES)

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

type ReporterOptions = {
  presenter: Presenter
  /** Whether the output is a terminal that can redraw a line, so a spinner shows the work. */
  canAnimate: boolean
}

/**
 * Shows the steps after writing inside the wizard frame, with a spinner while a step runs, or as
 * plain lines for scripts and CI. A failed step shows the end of its command's output.
 */
export const createStepReporter = ({ presenter, canAnimate }: ReporterOptions): StepReporter => {
  const { output, error, isFramed } = presenter
  const showResult = (isSuccess: boolean, message: string, commandOutput = ''): void => {
    const tail = tailOf(commandOutput)
    if (isFramed) {
      output.write(
        [renderStepResult(isSuccess, message), ...tail.map(renderCommandOutput)]
          .map((line) => `${line}\n`)
          .join(''),
      )
      return
    }
    const stream = isSuccess ? output : error
    const lines = [message, ...tail.map((line) => `${PLAIN_OUTPUT_INDENT}${line}`)]
    stream.write(lines.map((line) => `${line}\n`).join(''))
  }
  const openStep = (): void => {
    if (isFramed) {
      output.write(`${renderFrameLine('')}\n`)
    }
  }
  return {
    note: (message) => {
      openStep()
      showResult(false, message)
    },
    step: async (messages, action) => {
      openStep()
      const stopSpinner = isFramed && canAnimate ? startSpinner(output, messages.start) : () => {}
      const result = await action().finally(stopSpinner)
      showResult(
        result.isSuccess,
        result.isSuccess ? messages.done : messages.failed,
        result.isSuccess ? '' : result.output,
      )
      return result.isSuccess
    },
  }
}
