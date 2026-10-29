import type { Answers } from '../answers/answers.ts'
import { evaluateCondition } from '../answers/evaluate-condition.ts'
import type { ParsedPluginManifest } from '../contract/plugin-manifest.ts'
import type { PluginOption } from '../contract/plugin-option.ts'
import { defaultAnswer } from '../input/resolve-answers.ts'
import { renderSectionBadge } from '../ui/theme.ts'
import { type Choice, confirm, multiselect, type Streams, select, text } from './prompts.ts'
import type { Ask, WizardStep } from './run-wizard.ts'

const NONE_LABEL = 'None'
const QUICK_START_QUESTION = 'Use the quick start? Every remaining question takes its default.'

type PromptOptions = Streams & { canGoBack: boolean }

const withPlugin = (answers: Answers, plugin: ParsedPluginManifest): Answers => ({
  ...answers,
  plugins: [...answers.plugins, { name: plugin.name, category: plugin.category }],
})

/** A plugin choice, disabled when one of its conflicts already holds. */
const pluginChoice = (plugin: ParsedPluginManifest, answers: Answers): Choice<string> => {
  const conflict = (plugin.conflicts ?? []).find((rule) =>
    evaluateCondition(rule.when, withPlugin(answers, plugin)),
  )
  return conflict === undefined
    ? { value: plugin.name, label: plugin.title, hint: plugin.description }
    : { value: plugin.name, label: plugin.title, hint: conflict.reason, disabled: true }
}

const isNumberText = (value: string): boolean =>
  value.trim() !== '' && Number.isFinite(Number(value))

const askOption = async (
  option: PluginOption,
  base: Streams & { canGoBack: boolean },
): Promise<unknown> => {
  const message = option.question
  switch (option.type) {
    case 'boolean':
      return confirm({ ...base, message, initialValue: option.default })
    case 'string':
      return text({ ...base, message, defaultValue: option.default })
    case 'number': {
      const answer = await text({
        ...base,
        message,
        defaultValue: String(option.default),
        validate: (value) => (isNumberText(value) ? undefined : 'Enter a number'),
      })
      return typeof answer === 'string' ? Number(answer) : answer
    }
    case 'select':
      return select({ ...base, message, choices: option.choices, initialValue: option.default })
    case 'multiselect':
      return multiselect({
        ...base,
        message,
        choices: option.choices,
        initialValues: option.default,
      })
  }
}

const askStep = async (
  step: WizardStep,
  base: PromptOptions,
  answers: Answers,
): Promise<unknown> => {
  switch (step.kind) {
    case 'quick-start':
      return confirm({ ...base, message: QUICK_START_QUESTION, initialValue: false })
    case 'category': {
      const message = step.category.question
      const choices = step.choices.map((plugin) => pluginChoice(plugin, answers))
      if (step.category.cardinality === 'many') {
        return multiselect({ ...base, message, choices, initialValues: step.category.default })
      }
      if (step.category.cardinality === 'one') {
        return select({ ...base, message, choices, initialValue: step.category.default })
      }
      const withNone: Choice<string | null>[] = [...choices, { value: null, label: NONE_LABEL }]
      return select({ ...base, message, choices: withNone, initialValue: step.category.default })
    }
    case 'addon':
      return confirm({
        ...base,
        message: `Add ${step.plugin.title}?`,
        initialValue: defaultAnswer(step) === true,
      })
    case 'option':
    case 'setting':
      return askOption(step.option, base)
  }
}

/**
 * Asks each step in the terminal with the prompt that fits its kind, and prints a section badge
 * when the step starts another section than the step shown before.
 */
export const createAsk =
  (streams: Streams): Ask =>
  async (step, { canGoBack, answers, previousSection }) => {
    if (step.section !== undefined && step.section !== previousSection) {
      streams.output.write(renderSectionBadge(step.section))
    }
    return askStep(step, { ...streams, canGoBack }, answers)
  }
