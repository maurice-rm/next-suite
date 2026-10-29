import type { Answers } from '../answers/answers.ts'
import type { ParsedPluginManifest } from '../contract/plugin-manifest.ts'
import { renderFramed } from '../ui/theme.ts'
import { assertCompatible, findConflicts, findIncompatibilities } from './find-incompatibilities.ts'
import { InputError } from './input-error.ts'
import { DEFAULT_PROJECT_DIRECTORY } from './project-name.ts'
import type { Question } from './questions.ts'
import { type AnswerInput, resolveAnswers } from './resolve-answers.ts'
import { createAsk } from './wizard/ask-question.ts'
import { runWizard } from './wizard/run-wizard.ts'
import type { Streams } from './wizard/streams.ts'

const INCOMPATIBLE_IN_WIZARD = 'The answers do not fit together; change one with b:'

/** How open questions are answered: asked in the wizard, or from the input and maybe the defaults. */
type AnswerMode =
  | {
      kind: 'wizard'
      streams: Streams
      detectedPackageManager: string | undefined
    }
  | { kind: 'input'; useDefaults: boolean }

/** Where the answers of a run come from and how open questions are answered. */
export type AnswerSources = {
  /** The project directory from the command line, if it named one. */
  directory: string | undefined
  questions: readonly Question[]
  plugins: readonly ParsedPluginManifest[]
  input: AnswerInput
  flagKeys: ReadonlySet<string>
  mode: AnswerMode
}

/** The answers of a run and the directory of the project. */
type CollectedAnswers = { answers: Answers; directory: string }

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
  const { questions, plugins, input } = sources
  assertCompatible(
    findConflicts(plugins, resolveAnswers({ questions, input, useDefaults: false }).answers),
  )
  const result = await runWizard({
    questions,
    input,
    directory: sources.directory,
    ask: createAsk(mode.streams, { detectedPackageManager: mode.detectedPackageManager }),
    findProblems: (answers) => findIncompatibilities(plugins, answers),
    showProblems: (problems) =>
      mode.streams.output.write(renderFramed([INCOMPATIBLE_IN_WIZARD, ...problems].join('\n'))),
  })
  assertNoUnused(result.unused, sources)
  return { answers: result.answers, directory: result.directory }
}

/** The directory from the command line, the default with --yes, or a failure. */
const directoryFromInput = (directory: string | undefined, useDefaults: boolean): string => {
  if (directory !== undefined) {
    return directory
  }
  if (useDefaults) {
    return DEFAULT_PROJECT_DIRECTORY
  }
  throw new InputError(
    'name the project directory, such as `create-next-suite my-app`, or pass --yes',
  )
}

/** The defaults of the run settings, which the input answers without asking. */
const runSettingDefaults = (questions: readonly Question[]): AnswerInput =>
  Object.fromEntries(
    questions.flatMap((question) =>
      question.kind === 'setting' && question.scope === 'run'
        ? [[question.key, question.option.default]]
        : [],
    ),
  )

const resolveFromInput = (
  sources: AnswerSources,
  { useDefaults }: Extract<AnswerMode, { kind: 'input' }>,
): CollectedAnswers => {
  const directory = directoryFromInput(sources.directory, useDefaults)
  const { questions, input, plugins } = sources
  const resolution = resolveAnswers({
    questions,
    input: { ...runSettingDefaults(questions), ...input },
    useDefaults,
  })
  assertNoUnused(resolution.unused, sources)
  if (resolution.missing.length > 0) {
    throw new InputError(
      `answers are missing; pass them as flags or in --answers, or use --yes:\n${listMissing(resolution.missing)}`,
    )
  }
  assertCompatible(findIncompatibilities(plugins, resolution.answers))
  return { answers: resolution.answers, directory }
}

/**
 * Collects the project directory and the answers of a run, in the wizard or from the input.
 * Missing answers, unused input and incompatible plugins fail.
 */
export const collectAnswers = async (sources: AnswerSources): Promise<CollectedAnswers> =>
  sources.mode.kind === 'wizard'
    ? askInWizard(sources, sources.mode)
    : resolveFromInput(sources, sources.mode)
