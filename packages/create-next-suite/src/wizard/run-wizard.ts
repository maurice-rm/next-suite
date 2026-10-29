import type { Answers } from '../answers/answers.ts'
import { BASE_SETTINGS_SECTION } from '../input/base-settings.ts'
import { InputError } from '../input/input-error.ts'
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

const resolveOpen = (questions: readonly Question[], state: WizardState): Resolution => {
  for (;;) {
    const resolution = resolveAnswers({
      questions,
      input: state.answers,
      useDefaults: state.quickStart === true,
    })
    const stale = state.asked.filter(
      (step) => step.kind !== 'quick-start' && resolution.unused.includes(step.key),
    )
    if (stale.length === 0) {
      return resolution
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

type ProblemHandling = Pick<WizardInput, 'findProblems' | 'showProblems'>

/** Ends the wizard with compatible answers, or shows the problems and steps back. */
const finish = (
  resolution: Resolution,
  state: WizardState,
  { findProblems, showProblems }: ProblemHandling,
): Outcome | undefined => {
  const problems = findProblems(resolution.answers)
  if (problems.length === 0) {
    return { answers: resolution.answers, unused: resolution.unused }
  }
  if (state.asked.length === 0) {
    throw new InputError(`the answers do not fit together:\n${problems.join('\n')}`)
  }
  showProblems(problems)
  stepBack(state)
  return undefined
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
  ...problemHandling
}: WizardInput): Promise<Outcome> => {
  const state: WizardState = { answers: { ...input }, asked: [], quickStart: undefined }
  for (;;) {
    const resolution = resolveOpen(questions, state)
    const [next] = resolution.missing
    if (next === undefined) {
      const outcome = finish(resolution, state, problemHandling)
      if (outcome !== undefined) {
        return outcome
      }
      continue
    }
    const step: WizardStep =
      state.quickStart === undefined && !next.isEssential ? QUICK_START_STEP : next
    const reply = await ask(step, {
      canGoBack: state.asked.length > 0,
      answers: resolution.answers,
      previousSection: state.asked.at(-1)?.section ?? initialSection,
    })
    if (reply === GO_BACK) {
      stepBack(state)
      continue
    }
    if (step.kind === 'quick-start') {
      state.quickStart = reply === true
    } else {
      state.answers[step.key] = reply
    }
    state.asked.push(step)
  }
}
