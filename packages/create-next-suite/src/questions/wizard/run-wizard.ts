import type { AnswerInput, Answers } from '../../answers/answers.ts'
import { isTargetAction, type TargetAction } from '../../answers/target-action.ts'
import { GO_BACK } from '../../ui/prompts.ts'
import { PROJECT_SECTION } from '../base-settings.ts'
import type { Question } from '../build-questions.ts'
import { assertCompatible } from '../find-incompatibilities.ts'
import { type Resolution, resolveAnswers } from '../resolve-answers.ts'

/** The question for the project directory, whose name is the package name. */
type ProjectNameStep = { kind: 'project-name'; key: string; section: string }

/** The question what to do with a target directory that already has files. */
type TargetActionStep = { kind: 'target-action'; key: string; section: string; directory: string }

/** The question whether every remaining question takes its default. */
type QuickStartStep = { kind: 'quick-start'; key: string; section: string }

/** A step only the wizard asks, whose reply is no answer of the run. */
type WizardOnlyStep = ProjectNameStep | TargetActionStep | QuickStartStep

/**
 * Something the wizard asks: the project name, what to do with existing files, a question of the
 * run, or whether to take the quick start.
 */
export type WizardStep = WizardOnlyStep | Question

/** The replies to the steps only the wizard asks, by step kind; undefined while not answered. */
type StepReplies = {
  'project-name': string | undefined
  'target-action': TargetAction | undefined
  'quick-start': boolean | undefined
}

/**
 * Where a run writes and what happens to files already there: the project directory and the
 * action from the command line, if it named them, and whether a directory has files already.
 */
export type TargetInput = {
  directory: string | undefined
  action: TargetAction | undefined
  hasExistingFiles: (directory: string) => boolean
}

const PROJECT_NAME_STEP: ProjectNameStep = {
  kind: 'project-name',
  key: 'project-name',
  section: PROJECT_SECTION,
}

const QUICK_START_STEP: QuickStartStep = {
  kind: 'quick-start',
  key: 'quick-start',
  section: PROJECT_SECTION,
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

type WizardInput = TargetInput & {
  questions: readonly Question[]
  input: AnswerInput
  ask: Ask
  findProblems: (answers: Answers) => string[]
  showProblems: (problems: string[]) => void
}

type WizardState = {
  input: Record<string, unknown>
  replies: StepReplies
  asked: WizardStep[]
  /** Answers of steps the user went back over, by step key. */
  previous: Record<string, unknown>
}

type WizardResult = Pick<Resolution, 'answers' | 'unused'> & {
  directory: string
  action: TargetAction
}

const isQuestionStep = (step: WizardStep): step is Question =>
  step.kind !== 'project-name' && step.kind !== 'target-action' && step.kind !== 'quick-start'

/** Whether going back to the step can change the answers, which the target steps cannot. */
const canChangeAnswers = (step: WizardStep): boolean =>
  isQuestionStep(step) || step.kind === 'quick-start'

const resolveCurrent = (questions: readonly Question[], state: WizardState): Resolution =>
  resolveAnswers({
    questions,
    input: state.input,
    useDefaults: state.replies['quick-start'] === true,
  })

/** Drops the wizard's answers that no asked question uses any more, until none is left. */
const dropStaleAnswers = (questions: readonly Question[], state: WizardState): void => {
  for (;;) {
    const { unused } = resolveCurrent(questions, state)
    const stale = state.asked.filter((step) => isQuestionStep(step) && unused.includes(step.key))
    if (stale.length === 0) {
      return
    }
    for (const step of stale) {
      delete state.input[step.key]
      state.asked.splice(state.asked.indexOf(step), 1)
    }
  }
}

const stepBack = (state: WizardState): void => {
  const step = state.asked.pop()
  if (step === undefined) {
    return
  }
  if (isQuestionStep(step)) {
    state.previous[step.key] = state.input[step.key]
    delete state.input[step.key]
    return
  }
  state.previous[step.key] = state.replies[step.kind]
  state.replies[step.kind] = undefined
}

/**
 * Shows incompatible answers and goes back one step; fails when the wizard asked no question that
 * could change them, only the project name and the target action at most.
 */
const stepBackFromProblems = (
  state: WizardState,
  problems: string[],
  showProblems: (problems: string[]) => void,
): void => {
  if (!state.asked.some(canChangeAnswers)) {
    assertCompatible(problems)
  }
  showProblems(problems)
  stepBack(state)
}

const recordReply = (state: WizardState, step: WizardStep, reply: unknown): void => {
  if (isQuestionStep(step)) {
    state.input[step.key] = reply
    return
  }
  switch (step.kind) {
    case 'project-name':
      state.replies['project-name'] = String(reply)
      return
    case 'target-action':
      state.replies['target-action'] = isTargetAction(reply) ? reply : undefined
      return
    case 'quick-start':
      state.replies['quick-start'] = reply === true
      return
  }
}

const applyReply = (state: WizardState, step: WizardStep, reply: unknown): void => {
  if (reply === GO_BACK) {
    stepBack(state)
    return
  }
  recordReply(state, step, reply)
  state.asked.push(step)
}

/** Every step is answered; the wizard only checks the answers before it ends. */
type Done = { kind: 'done'; directory: string; action: TargetAction }

type NextStepInput = {
  state: WizardState
  next: Question | undefined
  hasExistingFiles: (directory: string) => boolean
}

const nextStep = ({ state, next, hasExistingFiles }: NextStepInput): WizardStep | Done => {
  const { replies } = state
  const directory = replies['project-name']
  if (directory === undefined) {
    return PROJECT_NAME_STEP
  }
  if (replies['target-action'] === undefined && hasExistingFiles(directory)) {
    return { kind: 'target-action', key: 'target-action', section: PROJECT_SECTION, directory }
  }
  if (next === undefined) {
    return { kind: 'done', directory, action: replies['target-action'] ?? 'create' }
  }
  return replies['quick-start'] === undefined && !next.isEssential ? QUICK_START_STEP : next
}

/**
 * Asks every question the input leaves open, one at a time, starting with the project name when
 * the command line gave none and what to do when its directory already has files. Once the
 * questions that need exactly one plugin are answered, it offers the quick start, which takes the
 * default for every question left. Going back drops the previous answer; an answer that no longer
 * applies after a change is dropped too. When the answers are incompatible, the wizard shows why
 * and goes back one step.
 */
export const runWizard = async ({
  questions,
  input,
  directory,
  action,
  hasExistingFiles,
  ask,
  findProblems,
  showProblems,
}: WizardInput): Promise<WizardResult> => {
  const state: WizardState = {
    input: { ...input },
    replies: { 'project-name': directory, 'target-action': action, 'quick-start': undefined },
    asked: [],
    previous: {},
  }
  for (;;) {
    dropStaleAnswers(questions, state)
    const resolution = resolveCurrent(questions, state)
    const step = nextStep({ state, next: resolution.missing[0], hasExistingFiles })
    if (step.kind === 'done') {
      const problems = findProblems(resolution.answers)
      if (problems.length === 0) {
        return {
          answers: resolution.answers,
          unused: resolution.unused,
          directory: step.directory,
          action: step.action,
        }
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
