import type { Answers } from '../answers/answers.ts'
import { BASE_SETTINGS_SECTION } from '../input/base-settings.ts'
import { assertCompatible } from '../input/find-incompatibilities.ts'
import type { Question } from '../input/questions.ts'
import { type AnswerInput, type Resolution, resolveAnswers } from '../input/resolve-answers.ts'
import { GO_BACK } from './prompts.ts'

/** The question whether every remaining question takes its default. */
type QuickStartStep = { kind: 'quick-start'; key: string; section: string }

/** Something the wizard asks: a question of the run, or whether to take the quick start. */
export type WizardStep = Question | QuickStartStep

const QUICK_START_STEP: QuickStartStep = {
  kind: 'quick-start',
  key: 'quick-start',
  section: BASE_SETTINGS_SECTION,
}

/**
 * Asks one step; resolves with the answer, or GO_BACK. `previousSection` is the section of the
 * step shown before, so a section badge appears only where a section begins.
 */
export type Ask = (
  step: WizardStep,
  context: { canGoBack: boolean; answers: Answers; previousSection: string | undefined },
) => Promise<unknown>

type WizardInput = {
  questions: readonly Question[]
  input: AnswerInput
  ask: Ask
  findProblems: (answers: Answers) => string[]
  showProblems: (problems: string[]) => void
  /** The section shown before the first step, such as the section of the project name. */
  initialSection: string | undefined
}

type WizardState = {
  answers: Record<string, unknown>
  asked: WizardStep[]
  quickStart: boolean | undefined
}

type Outcome = Pick<Resolution, 'answers' | 'unused'>

const resolveCurrent = (questions: readonly Question[], state: WizardState): Resolution =>
  resolveAnswers({ questions, input: state.answers, useDefaults: state.quickStart === true })

/** Drops the wizard's answers that no asked question uses any more, until none is left. */
const dropStaleAnswers = (questions: readonly Question[], state: WizardState): void => {
  for (;;) {
    const { unused } = resolveCurrent(questions, state)
    const stale = state.asked.filter(
      (step) => step.kind !== 'quick-start' && unused.includes(step.key),
    )
    if (stale.length === 0) {
      return
    }
    for (const step of stale) {
      delete state.answers[step.key]
      state.asked.splice(state.asked.indexOf(step), 1)
    }
  }
}

const stepBack = (state: WizardState): void => {
  const step = state.asked.pop()
  if (step?.kind === 'quick-start') {
    state.quickStart = undefined
  } else if (step !== undefined) {
    delete state.answers[step.key]
  }
}

/** Shows incompatible answers and goes back one step; fails when the wizard asked nothing. */
const stepBackFromProblems = (
  state: WizardState,
  problems: string[],
  showProblems: (problems: string[]) => void,
): void => {
  if (state.asked.length === 0) {
    assertCompatible(problems)
  }
  showProblems(problems)
  stepBack(state)
}

const applyReply = (state: WizardState, step: WizardStep, reply: unknown): void => {
  if (reply === GO_BACK) {
    stepBack(state)
    return
  }
  if (step.kind === 'quick-start') {
    state.quickStart = reply === true
  } else {
    state.answers[step.key] = reply
  }
  state.asked.push(step)
}

/**
 * Asks every question the input leaves open, one at a time. Once the questions that need exactly
 * one plugin are answered, it offers the quick start, which takes the default for every question
 * left. Going back drops the previous answer; an answer that no longer applies after a change is
 * dropped too. When the answers are incompatible, the wizard shows why and goes back one step.
 */
export const runWizard = async ({
  questions,
  input,
  ask,
  initialSection,
  findProblems,
  showProblems,
}: WizardInput): Promise<Outcome> => {
  const state: WizardState = { answers: { ...input }, asked: [], quickStart: undefined }
  for (;;) {
    dropStaleAnswers(questions, state)
    const resolution = resolveCurrent(questions, state)
    const [next] = resolution.missing
    if (next === undefined) {
      const problems = findProblems(resolution.answers)
      if (problems.length === 0) {
        return { answers: resolution.answers, unused: resolution.unused }
      }
      stepBackFromProblems(state, problems, showProblems)
      continue
    }
    const step: WizardStep =
      state.quickStart === undefined && !next.isEssential ? QUICK_START_STEP : next
    const reply = await ask(step, {
      canGoBack: state.asked.length > 0,
      answers: resolution.answers,
      previousSection: state.asked.at(-1)?.section ?? initialSection,
    })
    applyReply(state, step, reply)
  }
}
