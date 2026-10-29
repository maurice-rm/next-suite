import { resolve } from 'node:path'
import type { Writable } from 'node:stream'

import { Command, CommanderError } from 'commander'
import packageJson from '../../package.json' with { type: 'json' }
import type { Answers } from '../answers/answers.ts'
import { composeProject } from '../compose/compose-project.ts'
import { BASE_SETTINGS, BASE_SETTINGS_SECTION } from '../input/base-settings.ts'
import { findConflicts, findIncompatibilities } from '../input/find-incompatibilities.ts'
import { answersFromFlags, createFlags } from '../input/flags.ts'
import { InputError } from '../input/input-error.ts'
import {
  DEFAULT_PROJECT_DIRECTORY,
  findProjectNameProblem,
  projectNameOf,
} from '../input/project-name.ts'
import { buildQuestions, type Question } from '../input/questions.ts'
import { readAnswerFile } from '../input/read-answer-file.ts'
import { recordAnswers } from '../input/record-answers.ts'
import { type AnswerInput, resolveAnswers } from '../input/resolve-answers.ts'
import { renderBanner } from '../ui/banner.ts'
import {
  failure,
  renderCancelled,
  renderFrameLine,
  renderIntro,
  renderOutro,
  renderSectionBadge,
} from '../ui/theme.ts'
import { createAsk } from '../wizard/ask-question.ts'
import { GO_BACK, type Streams, text, WizardCancelled } from '../wizard/prompts.ts'
import { runWizard } from '../wizard/run-wizard.ts'
import { describePlan, diffPlan } from '../write/describe-plan.ts'
import { writeProject } from '../write/write-project.ts'
import type { Assets } from './load-assets.ts'
import { describeExpectedError } from './report-error.ts'

/** Everything a run reads from outside: arguments, terminal, working directory and clock. */
export type CreateEnvironment = {
  argv: readonly string[]
  assets: Assets
  cliVersion: string
  cwd: string
  streams: Streams & { error: Writable }
  isInteractive: boolean
  columns: number
  now: () => Date
}

type CreateFlags = { yes?: boolean; answers?: string; dryRun?: boolean; diff?: boolean }

const EXIT_SUCCESS = 0
const REPOSITORY_LINK = packageJson.repository.url
  .replace(/^git\+https:\/\//, '')
  .replace(/\.git$/, '')
const EXIT_FAILURE = 1
const EXIT_CANCELLED = 130
const DRY_RUN_DONE = 'Dry run, nothing was written'
const INTRO = "Let's lay the foundation"
const CANCELLED = 'Operation cancelled.'

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

const frame = (text: string): string =>
  text
    .split('\n')
    .map((line) => `${renderFrameLine(line)}\n`)
    .join('')

const assertNoProblems = (problems: readonly string[]): void => {
  if (problems.length > 0) {
    throw new InputError(`the answers do not fit together:\n${problems.join('\n')}`)
  }
}

const askDirectory = async (
  environment: CreateEnvironment,
  flags: CreateFlags,
): Promise<string> => {
  if (flags.yes) {
    return DEFAULT_PROJECT_DIRECTORY
  }
  if (!environment.isInteractive) {
    throw new InputError(
      'name the project directory, such as `create-next-suite my-app`, or pass --yes',
    )
  }
  environment.streams.output.write(renderSectionBadge(BASE_SETTINGS_SECTION))
  const answer = await text({
    ...environment.streams,
    message: 'What is your project named?',
    canGoBack: false,
    defaultValue: DEFAULT_PROJECT_DIRECTORY,
    validate: (value) => findProjectNameProblem(projectNameOf(value)),
  })
  if (answer === GO_BACK) {
    throw new WizardCancelled()
  }
  return answer
}

type AnswerSources = {
  shownSection: string | undefined
  questions: readonly Question[]
  input: AnswerInput
  flagKeys: ReadonlySet<string>
  flags: CreateFlags
}

const collectAnswers = async (
  environment: CreateEnvironment,
  sources: AnswerSources,
): Promise<Answers> => {
  const { questions, input, flags } = sources
  const plugins = environment.assets.plugins.map((plugin) => plugin.manifest)
  const findProblems = (answers: Answers) => findIncompatibilities(plugins, answers)
  if (environment.isInteractive && !flags.yes) {
    assertNoProblems(
      findConflicts(plugins, resolveAnswers({ questions, input, useDefaults: false }).answers),
    )
    const result = await runWizard({
      questions,
      input,
      ask: createAsk(environment.streams),
      initialSection: sources.shownSection,
      findProblems,
      showProblems: (problems) =>
        environment.streams.output.write(
          ['The answers do not fit together; change one with b:', ...problems]
            .map((line) => `${renderFrameLine(line)}\n`)
            .join(''),
        ),
    })
    assertNoUnused(result.unused, sources)
    return result.answers
  }
  const resolution = resolveAnswers({ questions, input, useDefaults: flags.yes === true })
  assertNoUnused(resolution.unused, sources)
  if (resolution.missing.length > 0) {
    throw new InputError(
      `answers are missing; pass them as flags or in --answers, or use --yes:\n${listMissing(resolution.missing)}`,
    )
  }
  assertNoProblems(findProblems(resolution.answers))
  return resolution.answers
}

type QuestionFlags = ReturnType<typeof createFlags>

/** Whether the wizard frame is open, so a failure closes it. */
type FrameState = { isOpen: boolean }

type Invocation = {
  frameState: FrameState
  directory: string | undefined
  flags: CreateFlags & Record<string, unknown>
  questionFlags: QuestionFlags
}

const create = async (
  environment: CreateEnvironment,
  { directory: directoryArgument, flags, questionFlags, frameState }: Invocation,
): Promise<void> => {
  const fileInput =
    flags.answers === undefined ? {} : await readAnswerFile(resolve(environment.cwd, flags.answers))
  const isGuided = environment.isInteractive && !flags.yes
  if (isGuided) {
    frameState.isOpen = true
    environment.streams.output.write(
      renderBanner({
        version: environment.cliVersion,
        link: REPOSITORY_LINK,
        columns: environment.columns,
      }),
    )
    environment.streams.output.write(renderIntro(INTRO))
  }
  const flagInput = answersFromFlags(questionFlags, flags)
  const input = { ...fileInput, ...flagInput }
  const directory = directoryArgument ?? (await askDirectory(environment, flags))
  const projectName = projectNameOf(directory)
  const nameProblem = findProjectNameProblem(projectName)
  if (nameProblem !== undefined) {
    throw new InputError(`"${projectName}" is no valid package name: ${nameProblem}`)
  }
  const questions = questionFlags.map((flag) => flag.question)
  const answers = await collectAnswers(environment, {
    shownSection: isGuided && directoryArgument === undefined ? BASE_SETTINGS_SECTION : undefined,
    questions,
    input,
    flagKeys: new Set(Object.keys(flagInput)),
    flags,
  })
  const { assets } = environment
  const selected = answers.plugins.flatMap((answer) =>
    assets.plugins.filter((plugin) => plugin.manifest.name === answer.name),
  )
  const plan = await composeProject({
    projectName,
    base: assets.base,
    available: assets.plugins,
    selected,
    answers,
    recordedAnswers: recordAnswers(questions, answers),
    catalog: assets.catalog,
    cliVersion: environment.cliVersion,
    createdAt: environment.now(),
  })
  const { output } = environment.streams
  if (flags.dryRun) {
    const planText = flags.diff ? `${describePlan(plan)}\n\n${diffPlan(plan)}` : describePlan(plan)
    output.write(isGuided ? frame(planText) + renderOutro(DRY_RUN_DONE) : `${planText}\n`)
    return
  }
  await writeProject(plan, resolve(environment.cwd, directory))
  output.write(isGuided ? renderOutro(`Created ${directory}`) : `Created ${directory}\n`)
}

const createProgram = (
  environment: CreateEnvironment,
  questionFlags: QuestionFlags,
  frameState: FrameState,
): Command => {
  const program = new Command()
    .name('create-next-suite')
    .description('Create a Next.js app from plugins.')
    .version(environment.cliVersion)
    .argument('[directory]', 'the directory to create; its name is the package name')
    .option('-y, --yes', 'answer every open question with its default')
    .option(
      '--answers <file>',
      'read answers from a JSON file in the format of `answers` in next-suite.json',
    )
    .option('--dry-run', 'show what would be created, write nothing')
    .option('--diff', 'with --dry-run, show the content of every file')
    .exitOverride()
    .configureOutput({
      writeOut: (text) => environment.streams.output.write(text),
      writeErr: (text) => environment.streams.error.write(text),
    })
  for (const option of questionFlags.flatMap((flag) => flag.options)) {
    program.addOption(option)
  }
  return program.action(
    (directory: string | undefined, flags: CreateFlags & Record<string, unknown>) =>
      create(environment, { directory, flags, questionFlags, frameState }),
  )
}

/**
 * Runs `create-next-suite` and answers its exit code. Expected failures, such as invalid answers
 * or conflicting plugins, print one message to the error stream; anything else is rethrown.
 */
export const runCreate = async (environment: CreateEnvironment): Promise<number> => {
  const frameState: FrameState = { isOpen: false }
  try {
    const questions = buildQuestions({
      categories: environment.assets.categories,
      plugins: environment.assets.plugins.map((plugin) => plugin.manifest),
      settings: BASE_SETTINGS,
    })
    await createProgram(environment, createFlags(questions), frameState).parseAsync(
      [...environment.argv],
      {
        from: 'user',
      },
    )
    return EXIT_SUCCESS
  } catch (error) {
    if (error instanceof CommanderError) {
      return error.exitCode
    }
    if (error instanceof WizardCancelled) {
      environment.streams.output.write(renderCancelled(CANCELLED))
      return EXIT_CANCELLED
    }
    const message = describeExpectedError(error)
    environment.streams.error.write(
      frameState.isOpen ? renderCancelled(message) : `${failure(message)}\n`,
    )
    return EXIT_FAILURE
  }
}
