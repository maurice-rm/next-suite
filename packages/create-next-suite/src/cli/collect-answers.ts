import type { Answers } from '../answers/answers.ts'
import type { ParsedPluginManifest } from '../contract/plugin-manifest.ts'
import {
  assertCompatible,
  findConflicts,
  findIncompatibilities,
} from '../input/find-incompatibilities.ts'
import { InputError } from '../input/input-error.ts'
import type { Question } from '../input/questions.ts'
import { type AnswerInput, resolveAnswers } from '../input/resolve-answers.ts'
import { createAsk } from '../wizard/ask-question.ts'
import { runWizard } from '../wizard/run-wizard.ts'
import type { Streams } from '../wizard/streams.ts'
import { frame } from './present.ts'

const INCOMPATIBLE_IN_WIZARD = 'The answers do not fit together; change one with b:'

/** How open questions are answered: asked in the wizard, or from the input and maybe the defaults. */
type AnswerMode =
  | { kind: 'wizard'; streams: Streams; initialSection: string | undefined }
  | { kind: 'input'; useDefaults: boolean }

/** Where the answers of a run come from and how open questions are answered. */
export type AnswerSources = {
  questions: readonly Question[]
  plugins: readonly ParsedPluginManifest[]
  input: AnswerInput
  flagKeys: ReadonlySet<string>
  mode: AnswerMode
}

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
): Promise<Answers> => {
  const { questions, plugins, input } = sources
  assertCompatible(
    findConflicts(plugins, resolveAnswers({ questions, input, useDefaults: false }).answers),
  )
  const result = await runWizard({
    questions,
    input,
    ask: createAsk(mode.streams),
    initialSection: mode.initialSection,
    findProblems: (answers) => findIncompatibilities(plugins, answers),
    showProblems: (problems) =>
      mode.streams.output.write(frame([INCOMPATIBLE_IN_WIZARD, ...problems].join('\n'))),
  })
  assertNoUnused(result.unused, sources)
  return result.answers
}

const resolveFromInput = (
  sources: AnswerSources,
  { useDefaults }: Extract<AnswerMode, { kind: 'input' }>,
): Answers => {
  const { questions, input, plugins } = sources
  const resolution = resolveAnswers({ questions, input, useDefaults })
  assertNoUnused(resolution.unused, sources)
  if (resolution.missing.length > 0) {
    throw new InputError(
      `answers are missing; pass them as flags or in --answers, or use --yes:\n${listMissing(resolution.missing)}`,
    )
  }
  assertCompatible(findIncompatibilities(plugins, resolution.answers))
  return resolution.answers
}

/**
 * Collects the answers of a run, in the wizard or from the input. Missing answers, unused input
 * and incompatible plugins fail.
 */
export const collectAnswers = async (sources: AnswerSources): Promise<Answers> =>
  sources.mode.kind === 'wizard'
    ? askInWizard(sources, sources.mode)
    : resolveFromInput(sources, sources.mode)
