import type { Answers } from '../../answers/answers.ts'
import { evaluateCondition } from '../../answers/evaluate-condition.ts'
import {
  PACKAGE_MANAGER_CATEGORY,
  type ParsedPluginManifest,
} from '../../contract/plugin-manifest.ts'
import type { PluginOption } from '../../contract/plugin-option.ts'
import { renderSectionBadge } from '../../ui/theme.ts'
import {
  DEFAULT_PROJECT_DIRECTORY,
  findProjectNameProblem,
  projectNameOf,
} from '../project-name.ts'
import type { CategoryQuestion } from '../questions.ts'
import { defaultAnswer } from '../resolve-answers.ts'
import { type Choice, confirm, multiselect, select, text } from './prompts.ts'
import type { Ask, WizardStep } from './run-wizard.ts'
import type { Streams } from './streams.ts'

const NONE_LABEL = 'None'
const DETECTED_HINT = 'detected'
const PROJECT_NAME_QUESTION = 'What is your project named?'
const QUICK_START_QUESTION = 'Use the quick start? Every remaining question takes its default.'

type PromptOptions = Streams & { canGoBack: boolean }

/** What the wizard knows about the run beyond the answers, such as the invoking package manager. */
type AskContext = { detectedPackageManager: string | undefined }

const withPlugin = (answers: Answers, plugin: ParsedPluginManifest): Answers => ({
  ...answers,
  plugins: [...answers.plugins, { name: plugin.name, category: plugin.category }],
})

/**
 * The hint beside a plugin: a package manager shows only whether it started the run, any other
 * plugin its description.
 */
const hintOf = (plugin: ParsedPluginManifest, context: AskContext): string | undefined => {
  if (plugin.category !== PACKAGE_MANAGER_CATEGORY) {
    return plugin.description
  }
  return plugin.name === context.detectedPackageManager ? DETECTED_HINT : undefined
}

/** A plugin choice, disabled when one of its conflicts already holds. */
const pluginChoice = (
  plugin: ParsedPluginManifest,
  answers: Answers,
  context: AskContext,
): Choice<string> => {
  const conflict = (plugin.conflicts ?? []).find((rule) =>
    evaluateCondition(rule.when, withPlugin(answers, plugin)),
  )
  if (conflict !== undefined) {
    return { value: plugin.name, label: plugin.title, hint: conflict.reason, disabled: true }
  }
  const hint = hintOf(plugin, context)
  return hint === undefined
    ? { value: plugin.name, label: plugin.title }
    : { value: plugin.name, label: plugin.title, hint }
}

const isNumberText = (value: string): boolean =>
  value.trim() !== '' && Number.isFinite(Number(value))

const askOption = async (option: PluginOption, base: PromptOptions): Promise<unknown> => {
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

/** A step to ask, with the answers so far and what the wizard knows about the run. */
type StepAsk = { base: PromptOptions; answers: Answers; context: AskContext }

const askCategory = async (
  question: CategoryQuestion,
  { base, answers, context }: StepAsk,
): Promise<unknown> => {
  const message = question.category.question
  const choices = question.choices.map((plugin) => pluginChoice(plugin, answers, context))
  switch (question.category.cardinality) {
    case 'many':
      return multiselect({ ...base, message, choices, initialValues: question.category.default })
    case 'one':
      return select({ ...base, message, choices, initialValue: question.category.default })
    case 'at-most-one': {
      const withNone: Choice<string | null>[] = [...choices, { value: null, label: NONE_LABEL }]
      return select({
        ...base,
        message,
        choices: withNone,
        initialValue: question.category.default,
      })
    }
  }
}

const askStep = async (step: WizardStep, { base, answers, context }: StepAsk) => {
  switch (step.kind) {
    case 'project-name':
      return text({
        ...base,
        message: PROJECT_NAME_QUESTION,
        defaultValue: DEFAULT_PROJECT_DIRECTORY,
        validate: (value) => findProjectNameProblem(projectNameOf(value)),
      })
    case 'quick-start':
      return confirm({ ...base, message: QUICK_START_QUESTION, initialValue: false })
    case 'category':
      return askCategory(step, { base, answers, context })
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
  (streams: Streams, context: AskContext): Ask =>
  async (step, { canGoBack, answers, previousSection }) => {
    if (step.section !== undefined && step.section !== previousSection) {
      streams.output.write(renderSectionBadge(step.section))
    }
    return askStep(step, { base: { ...streams, canGoBack }, answers, context })
  }
