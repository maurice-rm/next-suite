import type { Answers } from '../../answers/answers.ts'
import { BASE_SETTINGS_SECTION } from '../base-settings.ts'
import { assertCompatible } from '../find-incompatibilities.ts'
import type { Question } from '../questions.ts'
import { type AnswerInput, type Resolution, resolveAnswers } from '../resolve-answers.ts'
import { GO_BACK } from './prompts.ts'

/** The question for the project directory, whose name is the package name. */
type ProjectNameStep = { kind: 'project-name'; key: string; section: string }

/** The question whether every remaining question takes its default. */
type QuickStartStep = { kind: 'quick-start'; key: string; section: string }

/**
 * Something the wizard asks: the project name, a question of the run, or whether to take the
 * quick start.
 */
export type WizardStep = ProjectNameStep | Question | QuickStartStep

const PROJECT_NAME_STEP: ProjectNameStep = {
  kind: 'project-name',
  key: 'project-name',
  section: BASE_SETTINGS_SECTION,
}

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
  context: {
    canGoBack: boolean
    answers: Answers
    previousSection: string | undefined
    /** The answer given to this step before the user went back over it, to show it again. */
    previousAnswer: unknown
  },
) => Promise<unknown>

type WizardInput = {
  questions: readonly Question[]
  input: AnswerInput
  /** The project directory from the command line; the wizard asks for it when it is missing. */
  directory: string | undefined
  ask: Ask
  findProblems: (answers: Answers) => string[]
  showProblems: (problems: string[]) => void
}

type WizardState = {
  answers: Record<string, unknown>
  asked: WizardStep[]
  directory: string | undefined
  quickStart: boolean | undefined
  /** Answers of steps the user went back over, by step key. */
  previous: Record<string, unknown>
}

type Outcome = Pick<Resolution, 'answers' | 'unused'> & { directory: string }

const resolveCurrent = (questions: readonly Question[], state: WizardState): Resolution =>
  resolveAnswers({ questions, input: state.answers, useDefaults: state.quickStart === true })

/** Drops the wizard's answers that no asked question uses any more, until none is left. */
const dropStaleAnswers = (questions: readonly Question[], state: WizardState): void => {
  for (;;) {
    const { unused } = resolveCurrent(questions, state)
    const stale = state.asked.filter(
      (step) =>
        step.kind !== 'quick-start' && step.kind !== 'project-name' && unused.includes(step.key),
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
  if (step?.kind === 'project-name') {
    state.previous[step.key] = state.directory
    state.directory = undefined
  } else if (step?.kind === 'quick-start') {
    state.previous[step.key] = state.quickStart
    state.quickStart = undefined
  } else if (step !== undefined) {
    state.previous[step.key] = state.answers[step.key]
    delete state.answers[step.key]
  }
}

/**
 * Shows incompatible answers and goes back one step; fails when the wizard asked no question that
 * could change them, only the project name at most.
 */
const stepBackFromProblems = (
  state: WizardState,
  problems: string[],
  showProblems: (problems: string[]) => void,
): void => {
  if (state.asked.every((step) => step.kind === 'project-name')) {
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
  if (step.kind === 'project-name') {
    state.directory = String(reply)
  } else if (step.kind === 'quick-start') {
    state.quickStart = reply === true
  } else {
    state.answers[step.key] = reply
  }
  state.asked.push(step)
}

/** Every step is answered; the wizard only checks the answers before it ends. */
type Done = { kind: 'done'; directory: string }

const nextStep = (state: WizardState, next: Question | undefined): WizardStep | Done => {
  if (state.directory === undefined) {
    return PROJECT_NAME_STEP
  }
  if (next === undefined) {
    return { kind: 'done', directory: state.directory }
  }
  return state.quickStart === undefined && !next.isEssential ? QUICK_START_STEP : next
}

/**
 * Asks every question the input leaves open, one at a time, starting with the project name when
 * the command line gave none. Once the questions that need exactly one plugin are answered, it
 * offers the quick start, which takes the default for every question left. Going back drops the
 * previous answer; an answer that no longer applies after a change is dropped too. When the
 * answers are incompatible, the wizard shows why and goes back one step.
 */
export const runWizard = async ({
  questions,
  input,
  directory,
  ask,
  findProblems,
  showProblems,
}: WizardInput): Promise<Outcome> => {
  const state: WizardState = {
    answers: { ...input },
    asked: [],
    directory,
    quickStart: undefined,
    previous: {},
  }
  for (;;) {
    dropStaleAnswers(questions, state)
    const resolution = resolveCurrent(questions, state)
    const step = nextStep(state, resolution.missing[0])
    if (step.kind === 'done') {
      const problems = findProblems(resolution.answers)
      if (problems.length === 0) {
        return { answers: resolution.answers, unused: resolution.unused, directory: step.directory }
      }
      stepBackFromProblems(state, problems, showProblems)
      continue
    }
    const reply = await ask(step, {
      canGoBack: state.asked.length > 0,
      answers: resolution.answers,
      previousSection: state.asked.at(-1)?.section,
      previousAnswer: state.previous[step.key],
    })
    applyReply(state, step, reply)
  }
}
