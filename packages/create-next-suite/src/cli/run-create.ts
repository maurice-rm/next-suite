import { resolve } from 'node:path'
import type { Writable } from 'node:stream'

import { Command, CommanderError, Option } from 'commander'

import { composeProject } from '../compose/compose-project.ts'
import { BASE_SETTINGS } from '../input/base-settings.ts'
import { answersFromFlags, createFlags, type QuestionFlag } from '../input/flags.ts'
import { InputError } from '../input/input-error.ts'
import { findProjectNameProblem, projectNameOf } from '../input/project-name.ts'
import { buildQuestions } from '../input/questions.ts'
import { readAnswerFile } from '../input/read-answer-file.ts'
import { recordAnswers } from '../input/record-answers.ts'
import { GIT_SETTING, INSTALL_SETTING, RUN_SETTINGS } from '../input/run-settings.ts'
import {
  detectPackageManager,
  findUsablePackageManager,
  preferPackageManager,
} from '../package-manager/detect-package-manager.ts'
import type { CommandRunner } from '../package-manager/run-command.ts'
import { runPostSteps } from '../package-manager/run-post-steps.ts'
import type { Streams } from '../wizard/streams.ts'
import { WizardCancelled } from '../wizard/wizard-cancelled.ts'
import { describePlan, diffPlan } from '../write/describe-plan.ts'
import { writeProject } from '../write/write-project.ts'
import { askProjectDirectory } from './ask-project-directory.ts'
import { collectAnswers } from './collect-answers.ts'
import type { Assets } from './load-assets.ts'
import {
  openFrame,
  type Presenter,
  presentCancelled,
  presentCreated,
  presentDryRun,
  presentFailure,
  presentNothingGenerated,
} from './present.ts'
import { describeExpectedError } from './report-error.ts'
import { createStepReporter } from './report-steps.ts'

/**
 * Everything a run reads from outside: arguments, terminal, working directory, clock, the user
 * agent of the package manager that started it, and the commands it runs after writing.
 */
export type CreateEnvironment = {
  argv: readonly string[]
  assets: Assets
  cliVersion: string
  cwd: string
  streams: Streams & { error: Writable }
  isInteractive: boolean
  columns: number
  now: () => Date
  userAgent: string | undefined
  runCommand: CommandRunner
}

type CoreFlags = { yes?: boolean; answers?: string; dryRun?: boolean; diff?: boolean }

/** A parsed command line: the directory argument and every flag value. */
type Invocation = {
  directory: string | undefined
  flags: CoreFlags & Record<string, unknown>
}

const EXIT_SUCCESS = 0
const EXIT_FAILURE = 1
const EXIT_CANCELLED = 130

/** The options of create-next-suite itself; no plugin flag may take their names. */
const CORE_OPTIONS = [
  new Option('-y, --yes', 'answer every open question with its default'),
  new Option(
    '--answers <file>',
    'read answers from a JSON file in the format of `answers` in next-suite.json',
  ),
  new Option('--dry-run', 'show what would be created, write nothing'),
  new Option('--diff', 'with --dry-run, show the content of every file'),
]
const COMMANDER_OPTIONS = ['help', 'version']
const RESERVED_NAMES: ReadonlySet<string> = new Set([
  ...CORE_OPTIONS.map((option) => option.name()),
  ...COMMANDER_OPTIONS,
])

const readInput = async (
  environment: CreateEnvironment,
  { flags }: Invocation,
  questionFlags: QuestionFlag[],
) => {
  const fileInput =
    flags.answers === undefined ? {} : await readAnswerFile(resolve(environment.cwd, flags.answers))
  const flagInput = answersFromFlags(questionFlags, flags)
  return { input: { ...fileInput, ...flagInput }, flagKeys: new Set(Object.keys(flagInput)) }
}

const assertValidName = (projectName: string): void => {
  const problem = findProjectNameProblem(projectName)
  if (problem !== undefined) {
    throw new InputError(`"${projectName}" is no valid package name: ${problem}`)
  }
}

type Run = {
  environment: CreateEnvironment
  invocation: Invocation
  questionFlags: QuestionFlag[]
  given: Awaited<ReturnType<typeof readInput>>
  presenter: Presenter
  detectedPackageManager: string | undefined
}

const create = async ({
  environment,
  invocation,
  questionFlags,
  given,
  presenter,
  detectedPackageManager,
}: Run): Promise<void> => {
  const { flags } = invocation
  const useDefaults = flags.yes === true
  const { input, flagKeys } = given
  if (presenter.isFramed) {
    openFrame(presenter.output, { version: environment.cliVersion, columns: environment.columns })
  }
  const { directory, shownSection } =
    invocation.directory === undefined
      ? await askProjectDirectory({
          streams: environment.streams,
          isInteractive: environment.isInteractive,
          useDefaults,
        })
      : { directory: invocation.directory, shownSection: undefined }
  const projectName = projectNameOf(directory)
  assertValidName(projectName)
  const questions = questionFlags.map((flag) => flag.question)
  const { assets } = environment
  const answers = await collectAnswers({
    questions,
    plugins: assets.plugins.map((plugin) => plugin.manifest),
    input,
    flagKeys,
    mode: presenter.isFramed
      ? {
          kind: 'wizard',
          streams: environment.streams,
          initialSection: shownSection,
          detectedPackageManager,
        }
      : { kind: 'input', useDefaults },
  })
  if (assets.base === undefined) {
    presentNothingGenerated(presenter)
    return
  }
  const plan = await composeProject({
    projectName,
    base: assets.base,
    available: assets.plugins,
    selected: answers.plugins.flatMap((answer) =>
      assets.plugins.filter((plugin) => plugin.manifest.name === answer.name),
    ),
    answers,
    recordedAnswers: recordAnswers(questions, answers),
    catalog: assets.catalog,
    cliVersion: environment.cliVersion,
    createdAt: environment.now(),
  })
  if (flags.dryRun) {
    presentDryRun(
      presenter,
      flags.diff ? `${describePlan(plan)}\n\n${diffPlan(plan)}` : describePlan(plan),
    )
    return
  }
  const target = resolve(environment.cwd, directory)
  await writeProject(plan, target)
  await runPostSteps({
    directory: target,
    packageManager: plan.packageManager,
    scripts: plan.postSteps,
    shouldInstall: answers.settings[INSTALL_SETTING] === true,
    shouldInitializeGit: answers.settings[GIT_SETTING] === true,
    runCommand: environment.runCommand,
    reporter: createStepReporter({ presenter, canAnimate: environment.isInteractive }),
  })
  presentCreated(presenter, directory)
}

/** Parses the command line; answers nothing when commander already answered, such as --help. */
const parseCommandLine = async (
  environment: CreateEnvironment,
  questionFlags: QuestionFlag[],
): Promise<Invocation> => {
  let invocation: Invocation | undefined
  const program = new Command()
    .name('create-next-suite')
    .description('Create a Next.js app from plugins.')
    .version(environment.cliVersion)
    .argument('[directory]', 'the directory to create; its name is the package name')
    .exitOverride()
    .configureOutput({
      writeOut: (text) => environment.streams.output.write(text),
      writeErr: (text) => environment.streams.error.write(text),
    })
    .action((directory: string | undefined, flags: Invocation['flags']) => {
      invocation = { directory, flags }
    })
  for (const option of [...CORE_OPTIONS, ...questionFlags.flatMap((flag) => flag.options)]) {
    program.addOption(option)
  }
  await program.parseAsync([...environment.argv], { from: 'user' })
  if (invocation === undefined) {
    throw new InputError('the command line did not run the command')
  }
  return invocation
}

/**
 * Runs `create-next-suite` and answers its exit code. Expected failures, such as invalid answers
 * or conflicting plugins, print one message to the error stream; anything else is rethrown.
 */
export const runCreate = async (environment: CreateEnvironment): Promise<number> => {
  const plain: Presenter = {
    output: environment.streams.output,
    error: environment.streams.error,
    isFramed: false,
  }
  let presenter = plain
  try {
    const plugins = environment.assets.plugins.map((plugin) => plugin.manifest)
    const canGenerate = environment.assets.base !== undefined
    const detectedPackageManager = findUsablePackageManager(
      plugins,
      detectPackageManager(environment.userAgent),
    )
    const questions = buildQuestions({
      categories: preferPackageManager(environment.assets.categories, detectedPackageManager),
      plugins,
      settings: canGenerate ? BASE_SETTINGS : [],
      runSettings: canGenerate ? RUN_SETTINGS : [],
    })
    const questionFlags = createFlags(questions, RESERVED_NAMES)
    const invocation = await parseCommandLine(environment, questionFlags)
    const given = await readInput(environment, invocation, questionFlags)
    presenter = { ...plain, isFramed: environment.isInteractive && invocation.flags.yes !== true }
    await create({
      environment,
      invocation,
      questionFlags,
      given,
      presenter,
      detectedPackageManager,
    })
    return EXIT_SUCCESS
  } catch (error) {
    if (error instanceof CommanderError) {
      return error.exitCode
    }
    if (error instanceof WizardCancelled) {
      presentCancelled(presenter)
      return EXIT_CANCELLED
    }
    presentFailure(presenter, describeExpectedError(error))
    return EXIT_FAILURE
  }
}
