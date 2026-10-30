import type { Answers } from '../../answers/answers.ts'
import type { TargetAction } from '../../answers/target-action.ts'
import {
  PACKAGE_MANAGER_CATEGORY,
  type ParsedPluginManifest,
} from '../../contract/plugin-manifest.ts'
import type { PluginOption } from '../../contract/plugin-option.ts'
import { PromptCancelledError } from '../../ui/prompt-cancelled-error.ts'
import {
  type Choice,
  confirm,
  type GO_BACK,
  multiselect,
  type PromptBase,
  type Streams,
  select,
  text,
} from '../../ui/prompts.ts'
import { renderSectionBadge } from '../../ui/theme.ts'
import type { CategoryQuestion } from '../build-questions.ts'
import { findPluginProblems } from '../find-incompatibilities.ts'
import { DEFAULT_PROJECT_DIRECTORY } from '../project-directory.ts'
import { defaultAnswer } from '../resolve-answers.ts'
import { isNumberText, isStringList } from '../value-guards.ts'
import type { Ask, WizardStep } from './run-wizard.ts'

const NONE_LABEL = 'None'
const DETECTED_HINT = 'detected'
const PROJECT_NAME_QUESTION = 'Enter your project name or path ("." = current directory)'
const QUICK_START_QUESTION = 'Quick start with recommended defaults?'
const NOT_A_NUMBER = 'enter a number'
const CANCEL = 'cancel'
const EMPTY_LABEL = 'Empty the directory — delete everything except .git'
const OVERWRITE_LABEL = 'Continue (keep existing files)'
const CANCEL_LABEL = 'Cancel'

type PromptOptions = Omit<PromptBase, 'message'>

type TargetActionReply = Exclude<TargetAction, 'create'> | typeof CANCEL

/**
 * What the wizard knows about the run beyond the answers: what is wrong with a project directory,
 * and the package manager that started it.
 */
export type AskContext = {
  findDirectoryProblem: (directory: string) => string | undefined
  /** Whether a directory may be emptied; never the current directory, a root or the home directory. */
  canEmpty: (directory: string) => boolean
  detectedPackageManager: string | undefined
}

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
  const conflict = findPluginProblems(plugin, answers).find(
    (problem) => problem.kind === 'conflict',
  )
  if (conflict !== undefined) {
    return { value: plugin.name, label: plugin.title, hint: conflict.reason, disabled: true }
  }
  const hint = hintOf(plugin, context)
  return hint === undefined
    ? { value: plugin.name, label: plugin.title }
    : { value: plugin.name, label: plugin.title, hint }
}

const isString = (value: unknown): value is string => typeof value === 'string'
const isBoolean = (value: unknown): value is boolean => typeof value === 'boolean'
const isNumber = (value: unknown): value is number => typeof value === 'number'
const isNameOrNone = (value: unknown): value is string | null => value === null || isString(value)
const isTargetActionReply = (value: unknown): value is TargetActionReply =>
  value === 'empty' || value === 'overwrite' || value === CANCEL

/** The answer given before going back when it fits the question, otherwise the default. */
const previousOr = <Value>(
  previous: unknown,
  fallback: Value,
  fits: (value: unknown) => value is Value,
): Value => (fits(previous) ? previous : fallback)

const askOption = async (
  option: PluginOption,
  { base, previous }: { base: PromptOptions; previous: unknown },
): Promise<unknown> => {
  const message = option.question
  switch (option.type) {
    case 'boolean':
      return confirm({
        ...base,
        message,
        initialValue: previousOr(previous, option.default, isBoolean),
      })
    case 'string':
      return text({
        ...base,
        message,
        defaultValue: option.default,
        initialValue: previousOr(previous, undefined, isString),
      })
    case 'number': {
      const answer = await text({
        ...base,
        message,
        defaultValue: String(option.default),
        initialValue: isNumber(previous) ? String(previous) : undefined,
        validate: (value) => (isNumberText(value) ? undefined : NOT_A_NUMBER),
      })
      return typeof answer === 'string' ? Number(answer) : answer
    }
    case 'select':
      return select({
        ...base,
        message,
        choices: option.choices,
        initialValue: previousOr(previous, option.default, isString),
      })
    case 'multiselect':
      return multiselect({
        ...base,
        message,
        choices: option.choices,
        initialValues: previousOr(previous, option.default, isStringList),
      })
  }
}

/**
 * A step to ask, with the answers so far, the answer given before going back over it, and what
 * the wizard knows about the run.
 */
type StepAsk = { base: PromptOptions; answers: Answers; previous: unknown; context: AskContext }

const askCategory = async (
  question: CategoryQuestion,
  { base, answers, previous, context }: StepAsk,
): Promise<unknown> => {
  const message = question.category.question
  const choices = question.choices.map((plugin) => pluginChoice(plugin, answers, context))
  const { category } = question
  switch (category.cardinality) {
    case 'many':
      return multiselect({
        ...base,
        message,
        choices,
        initialValues: previousOr(previous, category.default, isStringList),
      })
    case 'one':
      return select({
        ...base,
        message,
        choices,
        initialValue: previousOr(previous, category.default, isString),
      })
    case 'at-most-one': {
      const withNone: Choice<string | null>[] = [...choices, { value: null, label: NONE_LABEL }]
      return select({
        ...base,
        message,
        choices: withNone,
        initialValue: previousOr(previous, category.default, isNameOrNone),
      })
    }
  }
}

/** Asks what to do with a directory that has files; cancelling ends the run. */
const askTargetAction = async (
  directory: string,
  { base, previous, context }: StepAsk,
): Promise<Exclude<TargetActionReply, typeof CANCEL> | typeof GO_BACK> => {
  const emptyChoice: Choice<TargetActionReply> = { value: 'empty', label: EMPTY_LABEL }
  const choices: Choice<TargetActionReply>[] = [
    ...(context.canEmpty(directory) ? [emptyChoice] : []),
    { value: 'overwrite', label: OVERWRITE_LABEL },
    { value: CANCEL, label: CANCEL_LABEL },
  ]
  const reply = await select({
    ...base,
    message: `"${directory}" exists and is not empty. How would you like to proceed?`,
    choices,
    initialValue: previousOr(previous, choices[0]?.value ?? CANCEL, isTargetActionReply),
  })
  if (reply === CANCEL) {
    throw new PromptCancelledError()
  }
  return reply
}

const askStep = async (step: WizardStep, ask: StepAsk): Promise<unknown> => {
  const { base, previous, context } = ask
  switch (step.kind) {
    case 'target-action':
      return askTargetAction(step.directory, ask)
    case 'project-name':
      return text({
        ...base,
        message: PROJECT_NAME_QUESTION,
        placeholder: DEFAULT_PROJECT_DIRECTORY,
        initialValue: previousOr(previous, undefined, isString),
        validate: context.findDirectoryProblem,
      })
    case 'quick-start':
      return confirm({
        ...base,
        message: QUICK_START_QUESTION,
        initialValue: previousOr(previous, false, isBoolean),
      })
    case 'category':
      return askCategory(step, ask)
    case 'extra':
      return confirm({
        ...base,
        message: `Add ${step.plugin.title}?`,
        initialValue: previousOr(previous, defaultAnswer(step) === true, isBoolean),
      })
    case 'option':
    case 'setting':
      return askOption(step.option, { base, previous })
  }
}

/**
 * Asks each step in the terminal with the prompt that fits its kind, and prints a section badge
 * when the step starts another section than the step shown before.
 */
export const createAsk =
  (streams: Streams, context: AskContext): Ask =>
  async (step, { canGoBack, answers, previousSection, previousAnswer }) => {
    if (step.section !== undefined && step.section !== previousSection) {
      streams.output.write(renderSectionBadge(step.section))
    }
    return askStep(step, {
      base: { ...streams, canGoBack },
      answers,
      previous: previousAnswer,
      context,
    })
  }
