import type { AnswerInput, Answers } from '../answers/answers.ts'
import type { TargetAction } from '../answers/target-action.ts'
import type { ParsedPluginManifest } from '../contract/plugin-manifest.ts'
import { InputError } from '../input-error.ts'
import { renderFramed } from '../ui/frame.ts'
import type { Streams } from '../ui/prompts.ts'
import type { Question, SettingScope } from './build-questions.ts'
import { assertCompatible, findConflicts, findIncompatibilities } from './find-incompatibilities.ts'
import { resolveAnswers } from './resolve-answers.ts'
import { type AskContext, createAsk } from './wizard/create-ask.ts'
import { runWizard, type TargetInput } from './wizard/run-wizard.ts'

const INCOMPATIBLE_IN_WIZARD = 'The answers do not fit together; change one with b:'

/** How open questions are answered: asked in the wizard, or from the input and maybe the defaults. */
type AnswerMode =
  | ({ kind: 'wizard'; streams: Streams } & AskContext)
  | { kind: 'input'; useDefaults: boolean }

/** Where the answers of a run come from and how open questions are answered. */
export type AnswerSources = TargetInput & {
  questions: readonly Question[]
  plugins: readonly ParsedPluginManifest[]
  input: AnswerInput
  flagKeys: ReadonlySet<string>
  mode: AnswerMode
}

/** The answers of a run, the directory of the project and what happens to files already there. */
type CollectedAnswers = { answers: Answers; directory: string; action: TargetAction }

const listMissing = (questions: readonly Question[]): string =>
  questions.map((question) => `  ${question.key}`).join('\n')

/**
 * The defaults of the settings in the given scopes, answered without asking: project settings are
 * never asked, only set by flag; run settings are asked in the wizard only.
 */
const settingDefaults = (
  questions: readonly Question[],
  scopes: readonly SettingScope[],
): AnswerInput =>
  Object.fromEntries(
    questions.flatMap((question) =>
      question.kind === 'setting' && scopes.includes(question.scope)
        ? [[question.key, question.option.default]]
        : [],
    ),
  )

/**
 * Rejects input no question used: every flag, and every key of the answer file that names no
 * question. A file key whose question is not asked after another choice, such as an option of a
 * plugin a flag replaced, is dropped.
 */
const assertNoUnused = (unused: readonly string[], sources: AnswerSources): void => {
  const known = new Set(sources.questions.map((question) => question.key))
  const rejected = unused.filter((key) => sources.flagKeys.has(key) || !known.has(key))
  if (rejected.length > 0) {
    throw new InputError(
      `these answers belong to no question that is asked: ${rejected.join(', ')}`,
    )
  }
}

/** Fails before the first question when the input alone already selects conflicting plugins. */
const assertInputHasNoConflicts = (sources: AnswerSources, input: AnswerInput): void => {
  const { answers } = resolveAnswers({ questions: sources.questions, input, useDefaults: false })
  assertCompatible(findConflicts(sources.plugins, answers))
}

const askInWizard = async (
  sources: AnswerSources,
  { streams, ...context }: Extract<AnswerMode, { kind: 'wizard' }>,
): Promise<CollectedAnswers> => {
  const { questions, plugins } = sources
  const input = { ...settingDefaults(questions, ['project']), ...sources.input }
  assertInputHasNoConflicts(sources, input)
  const result = await runWizard({
    questions,
    input,
    directory: sources.directory,
    action: sources.action,
    hasExistingFiles: sources.hasExistingFiles,
    ask: createAsk(streams, context),
    findProblems: (answers) => findIncompatibilities(plugins, answers),
    showProblems: (problems) =>
      streams.output.write(renderFramed([INCOMPATIBLE_IN_WIZARD, ...problems].join('\n'))),
  })
  assertNoUnused(result.unused, sources)
  return { answers: result.answers, directory: result.directory, action: result.action }
}

/** The directory from the command line; without a terminal it is required. */
const directoryFromInput = (directory: string | undefined, useDefaults: boolean): string => {
  if (directory !== undefined) {
    return directory
  }
  throw new InputError(
    useDefaults
      ? 'a project name is required in --yes mode — pass it as the argument'
      : 'a project name is required without a terminal — pass it as the argument, such as `create-next-suite my-app`',
  )
}

/** The action for the target without asking: what the flags say, or create when nothing is in the way. */
const actionFromInput = (sources: AnswerSources, directory: string): TargetAction => {
  if (sources.action !== undefined) {
    return sources.action
  }
  if (sources.hasExistingFiles(directory)) {
    throw new InputError(`"${directory}" is not empty — pass --overwrite or --empty to proceed`)
  }
  return 'create'
}

const resolveFromInput = (
  sources: AnswerSources,
  { useDefaults }: Extract<AnswerMode, { kind: 'input' }>,
): CollectedAnswers => {
  const directory = directoryFromInput(sources.directory, useDefaults)
  const action = actionFromInput(sources, directory)
  const { questions, input, plugins } = sources
  const resolution = resolveAnswers({
    questions,
    input: { ...settingDefaults(questions, ['project', 'run']), ...input },
    useDefaults,
  })
  assertNoUnused(resolution.unused, sources)
  if (resolution.missing.length > 0) {
    throw new InputError(
      `answers are missing; pass them as flags or in --answers, or use --yes:\n${listMissing(resolution.missing)}`,
    )
  }
  assertCompatible(findIncompatibilities(plugins, resolution.answers))
  return { answers: resolution.answers, directory, action }
}

/**
 * Collects the project directory and the answers of a run, in the wizard or from the input.
 * Missing answers, unused input and incompatible plugins fail.
 */
export const collectAnswers = async (sources: AnswerSources): Promise<CollectedAnswers> =>
  sources.mode.kind === 'wizard'
    ? askInWizard(sources, sources.mode)
    : resolveFromInput(sources, sources.mode)
