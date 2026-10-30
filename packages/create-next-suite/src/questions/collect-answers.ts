import type { Answers } from '../answers/answers.ts'
import type { TargetAction } from '../answers/target-action.ts'
import type { ParsedPluginManifest } from '../contract/plugin-manifest.ts'
import { InputError } from '../input-error.ts'
import type { Streams } from '../ui/prompts.ts'
import { renderFramed } from '../ui/theme.ts'
import { assertCompatible, findConflicts, findIncompatibilities } from './find-incompatibilities.ts'
import type { Question } from './questions.ts'
import { type AnswerInput, resolveAnswers } from './resolve-answers.ts'
import { createAsk } from './wizard/ask-question.ts'
import { runWizard } from './wizard/run-wizard.ts'

const INCOMPATIBLE_IN_WIZARD = 'The answers do not fit together; change one with b:'

/** How open questions are answered: asked in the wizard, or from the input and maybe the defaults. */
type AnswerMode =
  | {
      kind: 'wizard'
      streams: Streams
      findDirectoryProblem: (directory: string) => string | undefined
      canEmpty: (directory: string) => boolean
      detectedPackageManager: string | undefined
    }
  | { kind: 'input'; useDefaults: boolean }

/** Where the answers of a run come from and how open questions are answered. */
export type AnswerSources = {
  /** The project directory from the command line, if it named one. */
  directory: string | undefined
  /** What to do with a target that has files, from the command line, if it said. */
  action: TargetAction | undefined
  /** Whether a project directory already has files that stand in the way. */
  hasConflict: (directory: string) => boolean
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

const askInWizard = async (
  sources: AnswerSources,
  mode: Extract<AnswerMode, { kind: 'wizard' }>,
): Promise<CollectedAnswers> => {
  const { questions, plugins } = sources
  const input = { ...settingDefaults(questions, ['project']), ...sources.input }
  assertCompatible(
    findConflicts(plugins, resolveAnswers({ questions, input, useDefaults: false }).answers),
  )
  const result = await runWizard({
    questions,
    input,
    directory: sources.directory,
    action: sources.action,
    hasConflict: sources.hasConflict,
    ask: createAsk(mode.streams, {
      findDirectoryProblem: mode.findDirectoryProblem,
      canEmpty: mode.canEmpty,
      detectedPackageManager: mode.detectedPackageManager,
    }),
    findProblems: (answers) => findIncompatibilities(plugins, answers),
    showProblems: (problems) =>
      mode.streams.output.write(renderFramed([INCOMPATIBLE_IN_WIZARD, ...problems].join('\n'))),
  })
  assertNoUnused(result.unused, sources)
  return { answers: result.answers, directory: result.directory, action: result.action }
}

/** The action for the target without asking: what the flags say, or create when nothing is in the way. */
const actionFromInput = (sources: AnswerSources, directory: string): TargetAction => {
  if (sources.action !== undefined) {
    return sources.action
  }
  if (sources.hasConflict(directory)) {
    throw new InputError(
      `"${directory}" already has conflicting files — pass --overwrite or --empty to proceed.`,
    )
  }
  return 'create'
}

/** The directory from the command line; without a terminal it is required. */
const directoryFromInput = (directory: string | undefined, useDefaults: boolean): string => {
  if (directory !== undefined) {
    return directory
  }
  throw new InputError(
    useDefaults
      ? 'A project name is required in --yes mode — pass it as the argument.'
      : 'A project name is required without a terminal — pass it as the argument, such as `create-next-suite my-app`.',
  )
}

type SettingScope = Extract<Question, { kind: 'setting' }>['scope']

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
