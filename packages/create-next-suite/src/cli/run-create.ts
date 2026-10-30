import { resolve } from 'node:path'
import type { Writable } from 'node:stream'

import { CommanderError } from 'commander'
import type { Answers } from '../answers/answers.ts'
import type { TargetAction } from '../answers/target-action.ts'
import { InputError } from '../input-error.ts'
import {
  detectPackageManager,
  findUsablePackageManager,
} from '../package-manager/detect-package-manager.ts'
import { preferPackageManager } from '../package-manager/prefer-package-manager.ts'
import { CATEGORIES } from '../plugin-definition/categories.ts'
import type { Plugin } from '../plugin-definition/plugin-definition.ts'
import type { CommandRunner } from '../post-steps/run-command.ts'
import { runPostSteps } from '../post-steps/run-post-steps.ts'
import { BASE_SETTINGS } from '../questions/base-settings.ts'
import { buildQuestions, type Question } from '../questions/build-questions.ts'
import { collectAnswers } from '../questions/collect-answers.ts'
import { createFlags } from '../questions/flags.ts'
import { findProjectDirectoryProblem, projectNameOf } from '../questions/project-directory.ts'
import { recordAnswers } from '../questions/record-answers.ts'
import { GIT_SETTING, INSTALL_SETTING, RUN_SETTINGS } from '../questions/run-settings.ts'
import { PromptCancelledError } from '../ui/prompt-cancelled-error.ts'
import type { Streams } from '../ui/prompts.ts'
import { findEmptyingProblem } from '../write/empty-target.ts'
import { findTargetProblem, inspectTarget } from '../write/inspect-target.ts'
import { writeProject } from '../write/write-project.ts'
import type { BuiltInAssets } from './built-in-assets.ts'
import {
  type GivenAnswers,
  type Invocation,
  parseCommandLine,
  RESERVED_NAMES,
  readGivenAnswers,
  readPluginAddresses,
  targetActionOf,
} from './command-line.ts'
import { CREATE_COMMAND } from './command-name.ts'
import { describeError } from './describe-error.ts'
import { describePlan, diffPlan } from './describe-plan.ts'
import { EXIT_CANCELLED, EXIT_FAILURE, EXIT_SUCCESS } from './exit-code.ts'
import { refuseExternalPlugins } from './external-plugins.ts'
import { listNextSteps } from './list-next-steps.ts'
import { planProject } from './plan-project.ts'
import {
  openFrame,
  type Presenter,
  presentCancelled,
  presentCreated,
  presentDryRun,
  presentFailure,
} from './presenter.ts'
import type { ProjectPlan } from './project-plan.ts'
import { createStepReporter } from './step-reporter.ts'

/**
 * Everything a run reads from outside: arguments, terminal, working directory, clock, the user
 * agent of the package manager that started it, and the commands it runs after writing.
 */
export type CreateEnvironment = {
  argv: readonly string[]
  /** Loads the base project and the built-in plugins of the package. */
  loadAssets: () => Promise<BuiltInAssets>
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

/** Everything one run knows once the command line is read. */
type Run = {
  environment: CreateEnvironment
  assets: BuiltInAssets
  /** The plugins the questions offer. */
  plugins: Plugin[]
  invocation: Invocation
  given: GivenAnswers
  questions: Question[]
  detectedPackageManager: string | undefined
  presenter: Presenter
}

type DirectoryCheck = { cwd: string; action: TargetAction | undefined }

type Project = {
  directory: string
  projectName: string
  action: TargetAction
  answers: Answers
}

/**
 * The questions this run can ask: those of the built-in plugins, the base settings and the
 * settings of the run. The package manager that started the run becomes the default.
 */
const prepareQuestions = (plugins: readonly Plugin[], userAgent: string | undefined) => {
  const detectedPackageManager = findUsablePackageManager(plugins, detectPackageManager(userAgent))
  const questions = buildQuestions({
    categories: preferPackageManager(CATEGORIES, detectedPackageManager),
    plugins,
    settings: BASE_SETTINGS,
    runSettings: RUN_SETTINGS,
  })
  return { questions, detectedPackageManager }
}

/**
 * What is wrong with a project directory: as typed, what is already on disk at its path, and,
 * when the flags say to empty it, whether it may be emptied.
 */
const findDirectoryProblem = (
  directory: string,
  { cwd, action }: DirectoryCheck,
): string | undefined => {
  const path = resolve(cwd, directory)
  const problem = findProjectDirectoryProblem(directory, cwd) ?? findTargetProblem(directory, path)
  if (problem !== undefined) {
    return problem
  }
  if (action !== 'empty') {
    return undefined
  }
  if (inspectTarget(path) !== 'not-empty') {
    return undefined
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
  plugins,
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
    hasExistingFiles: (directory) => inspectTarget(resolve(cwd, directory)) === 'not-empty',
    questions,
    plugins,
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

/** Assembles the project in memory. */
const planRun = (
  { environment, assets, questions }: Run,
  { projectName, answers }: Project,
): ProjectPlan =>
  planProject({
    assets,
    projectName,
    answers,
    recordedAnswers: recordAnswers(questions, answers),
    cliVersion: environment.cliVersion,
    createdAt: environment.now(),
  })

/** Writes the project, runs the steps after writing, and shows what to do next. */
const writeAndFinish = async (
  { environment, presenter }: Run,
  { directory, projectName, action, answers }: Project,
  plan: ProjectPlan,
): Promise<void> => {
  const { cwd } = environment
  const target = resolve(cwd, directory)
  await writeProject(plan, { directory: target, action, cwd })
  const { isInstalled } = await runPostSteps({
    directory: target,
    packageManager: plan.packageManager,
    installArgs: plan.installArgs,
    scripts: plan.postSteps,
    shouldInstall: answers.settings[INSTALL_SETTING] === true,
    shouldInitializeGit: answers.settings[GIT_SETTING] === true,
    runCommand: environment.runCommand,
    reporter: createStepReporter({ presenter, canAnimate: environment.isInteractive }),
  })
  presentCreated(presenter, {
    projectName,
    stack: plan.summary.stack,
    nextSteps: listNextSteps({
      directory,
      cwd,
      packageManager: plan.projectPackageManager,
      isInstalled,
      nextSteps: plan.summary.nextSteps,
    }),
  })
}

/**
 * Runs the steps of create-next-suite: ask the questions, assemble the project in memory, write
 * it, then initialize git, install and commit.
 */
const create = async (run: Run): Promise<void> => {
  const { environment, invocation, presenter } = run
  const { cwd } = environment
  if (presenter.isFramed) {
    openFrame(presenter.output, {
      version: environment.cliVersion,
      latest: await environment.fetchLatestVersion(),
      columns: environment.columns,
    })
  }
  const { answers, directory, action } = await askQuestions(run)
  assertUsableDirectory(directory, { cwd, action })
  const project: Project = {
    directory,
    projectName: projectNameOf(directory, cwd),
    action,
    answers,
  }
  const plan = planRun(run, project)
  if (invocation.flags.dryRun) {
    const report = describePlan(plan)
    presentDryRun(presenter, invocation.flags.diff ? `${report}\n\n${diffPlan(plan)}` : report)
    return
  }
  await writeAndFinish(run, project, plan)
}

/**
 * Runs `create-next-suite` and answers its exit code. A failure prints one message to the error
 * stream: an expected one, such as invalid answers or conflicting plugins, says what is wrong;
 * any other asks to be reported.
 */
export const runCreate = async (environment: CreateEnvironment): Promise<number> => {
  const { streams } = environment
  const plain: Presenter = { output: streams.output, error: streams.error, isFramed: false }
  let presenter = plain
  try {
    if (readPluginAddresses(environment.argv).length > 0) {
      refuseExternalPlugins('--plugin')
    }
    const assets = await environment.loadAssets()
    const plugins = assets.plugins.map(({ plugin }) => plugin)
    const { questions, detectedPackageManager } = prepareQuestions(plugins, environment.userAgent)
    const questionFlags = createFlags(questions, RESERVED_NAMES)
    const invocation = await parseCommandLine(
      { argv: environment.argv, cliVersion: environment.cliVersion, ...streams },
      questionFlags,
    )
    const given = await readGivenAnswers(invocation, { cwd: environment.cwd, questionFlags })
    presenter = { ...plain, isFramed: environment.isInteractive && invocation.flags.yes !== true }
    await create({
      environment,
      assets,
      plugins,
      invocation,
      given,
      questions,
      detectedPackageManager,
      presenter,
    })
    return EXIT_SUCCESS
  } catch (error) {
    if (error instanceof CommanderError) {
      return error.exitCode
    }
    if (error instanceof PromptCancelledError) {
      presentCancelled(presenter)
      return EXIT_CANCELLED
    }
    presentFailure(presenter, describeError(error, CREATE_COMMAND))
    return EXIT_FAILURE
  }
}
