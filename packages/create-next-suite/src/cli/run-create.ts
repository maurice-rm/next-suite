import { resolve } from 'node:path'
import type { Writable } from 'node:stream'

import { CommanderError } from 'commander'
import type { TargetAction } from '../answers/target-action.ts'
import { composeProject } from '../compose/compose-project.ts'
import type { Assets } from '../loader/load-assets.ts'
import type { CommandRunner } from '../post-steps/run-command.ts'
import { runPostSteps } from '../post-steps/run-post-steps.ts'
import { BASE_SETTINGS } from '../questions/base-settings.ts'
import { collectAnswers } from '../questions/collect-answers.ts'
import { createFlags } from '../questions/flags.ts'
import { InputError } from '../questions/input-error.ts'
import { findProjectDirectoryProblem, projectNameOf } from '../questions/project-name.ts'
import { buildQuestions, type Question } from '../questions/questions.ts'
import { recordAnswers } from '../questions/record-answers.ts'
import { GIT_SETTING, INSTALL_SETTING, RUN_SETTINGS } from '../questions/run-settings.ts'
import type { Streams } from '../questions/wizard/streams.ts'
import { WizardCancelled } from '../questions/wizard/wizard-cancelled.ts'
import { describePlan, diffPlan } from '../write/describe-plan.ts'
import { findEmptyingProblem } from '../write/empty-target.ts'
import { findTargetProblem, inspectTarget } from '../write/inspect-target.ts'
import { writeProject } from '../write/write-project.ts'
import {
  type GivenAnswers,
  type Invocation,
  parseCommandLine,
  RESERVED_NAMES,
  readGivenAnswers,
  targetActionOf,
} from './command-line.ts'
import {
  detectPackageManager,
  findUsablePackageManager,
  preferPackageManager,
} from './detect-package-manager.ts'
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
  /** The latest published version for the banner; answers nothing when unknown. */
  fetchLatestVersion: () => Promise<string | undefined>
}

const EXIT_SUCCESS = 0
const EXIT_FAILURE = 1
const EXIT_CANCELLED = 130

/** Everything one run knows once the command line is read. */
type Run = {
  environment: CreateEnvironment
  invocation: Invocation
  given: GivenAnswers
  questions: Question[]
  detectedPackageManager: string | undefined
  presenter: Presenter
}

/**
 * The questions this run can ask: those of the loaded plugins, and the settings only when a base
 * project exists to apply them to. The package manager that started the run becomes the default.
 */
const prepareQuestions = ({ assets, userAgent }: CreateEnvironment) => {
  const plugins = assets.plugins.map((plugin) => plugin.manifest)
  const canGenerate = assets.base !== undefined
  const detectedPackageManager = findUsablePackageManager(plugins, detectPackageManager(userAgent))
  const questions = buildQuestions({
    categories: preferPackageManager(assets.categories, detectedPackageManager),
    plugins,
    settings: canGenerate ? BASE_SETTINGS : [],
    runSettings: canGenerate ? RUN_SETTINGS : [],
  })
  return { questions, detectedPackageManager }
}

type DirectoryCheck = { cwd: string; action: TargetAction | undefined }

/**
 * What is wrong with a project directory: as typed, what is already on disk at its path, and,
 * when the flags say to empty it, whether it may be emptied.
 */
const findDirectoryProblem = (directory: string, { cwd, action }: DirectoryCheck) => {
  const path = resolve(cwd, directory)
  const problem = findProjectDirectoryProblem(directory, cwd) ?? findTargetProblem(directory, path)
  if (problem !== undefined || action !== 'empty' || inspectTarget(path) !== 'not-empty') {
    return problem
  }
  return findEmptyingProblem(path, cwd)
}

const assertUsableDirectory = (directory: string, check: DirectoryCheck): void => {
  const problem = findDirectoryProblem(directory, check)
  if (problem !== undefined) {
    throw new InputError(problem)
  }
}

/** The project directory and the answers, in the wizard or from flags and the file. */
const askQuestions = ({
  environment,
  invocation,
  given,
  questions,
  detectedPackageManager,
  presenter,
}: Run) => {
  const { cwd } = environment
  const check: DirectoryCheck = { cwd, action: targetActionOf(invocation) }
  if (invocation.directory !== undefined) {
    assertUsableDirectory(invocation.directory, check)
  }
  return collectAnswers({
    directory: invocation.directory,
    action: check.action,
    hasConflict: (directory) => inspectTarget(resolve(cwd, directory)) === 'not-empty',
    questions,
    plugins: environment.assets.plugins.map((plugin) => plugin.manifest),
    ...given,
    mode: presenter.isFramed
      ? {
          kind: 'wizard',
          streams: environment.streams,
          findDirectoryProblem: (directory: string) => findDirectoryProblem(directory, check),
          canEmpty: (directory: string) =>
            findEmptyingProblem(resolve(cwd, directory), cwd) === undefined,
          detectedPackageManager,
        }
      : { kind: 'input', useDefaults: invocation.flags.yes === true },
  })
}

/**
 * Runs the steps of create-next-suite: ask the questions, compose the project in memory, write
 * it, then initialize git, install and commit.
 */
const create = async (run: Run): Promise<void> => {
  const { environment, invocation, questions, presenter } = run
  const { assets } = environment
  if (presenter.isFramed) {
    openFrame(presenter.output, {
      version: environment.cliVersion,
      latest: await environment.fetchLatestVersion(),
      columns: environment.columns,
    })
  }
  const { answers, directory, action } = await askQuestions(run)
  assertUsableDirectory(directory, { cwd: environment.cwd, action })
  if (assets.base === undefined) {
    presentNothingGenerated(presenter)
    return
  }
  const plan = await composeProject({
    projectName: projectNameOf(directory, environment.cwd),
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
  if (invocation.flags.dryRun) {
    const report = describePlan(plan)
    presentDryRun(presenter, invocation.flags.diff ? `${report}\n\n${diffPlan(plan)}` : report)
    return
  }
  const target = resolve(environment.cwd, directory)
  await writeProject(plan, { directory: target, action, cwd: environment.cwd })
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

/**
 * Runs `create-next-suite` and answers its exit code. Expected failures, such as invalid answers
 * or conflicting plugins, print one message to the error stream; anything else is rethrown.
 */
export const runCreate = async (environment: CreateEnvironment): Promise<number> => {
  const { streams } = environment
  const plain: Presenter = { output: streams.output, error: streams.error, isFramed: false }
  let presenter = plain
  try {
    const { questions, detectedPackageManager } = prepareQuestions(environment)
    const questionFlags = createFlags(questions, RESERVED_NAMES)
    const invocation = await parseCommandLine(
      { argv: environment.argv, version: environment.cliVersion, ...streams },
      questionFlags,
    )
    const given = await readGivenAnswers(invocation, { cwd: environment.cwd, questionFlags })
    presenter = { ...plain, isFramed: environment.isInteractive && invocation.flags.yes !== true }
    await create({ environment, invocation, given, questions, detectedPackageManager, presenter })
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
