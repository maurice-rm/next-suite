import { resolve } from 'node:path'
import type { Writable } from 'node:stream'

import { CommanderError } from 'commander'
import type { Answers } from '../answers/answers.ts'
import type { TargetAction } from '../answers/target-action.ts'
import { composeProject, type ProjectPlan } from '../compose/compose-project.ts'
import type { ParsedPluginManifest } from '../contract/plugin-manifest.ts'
import { InputError } from '../input-error.ts'
import { assertUniqueNames } from '../loader/assert-unique-names.ts'
import type { Assets } from '../loader/load-assets.ts'
import { loadExternalPlugins } from '../loader/load-external-plugins.ts'
import { loadLogic } from '../loader/load-logic.ts'
import { type LoadedPlugin, namedPlugin } from '../loader/load-plugin.ts'
import type { RemoteEnvironment } from '../loader/remote/remote-source.ts'
import {
  detectPackageManager,
  findUsablePackageManager,
} from '../package-manager/detect-package-manager.ts'
import { preferPackageManager } from '../package-manager/prefer-package-manager.ts'
import { CATEGORIES } from '../plugin-definition/categories.ts'
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
import { readUserConfig } from '../user-config/user-config.ts'
import { findEmptyingProblem } from '../write/empty-target.ts'
import { findTargetProblem, inspectTarget } from '../write/inspect-target.ts'
import { writeProject } from '../write/write-project.ts'
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
import { confirmTrust } from './confirm-trust.ts'
import { describeError } from './describe-error.ts'
import { describePlan, diffPlan } from './describe-plan.ts'
import type { EngineV2Assets } from './engine-v2/engine-v2-assets.ts'
import { planV2Project } from './engine-v2/plan-v2-project.ts'
import { questionPlugins } from './engine-v2/question-plugins.ts'
import { ENGINE_VARIABLE, selectEngine } from './engine-v2/select-engine.ts'
import { EXIT_CANCELLED, EXIT_FAILURE, EXIT_SUCCESS } from './exit-code.ts'
import { listNextSteps } from './list-next-steps.ts'
import {
  openFrame,
  type Presenter,
  presentCancelled,
  presentCreated,
  presentDryRun,
  presentFailure,
  presentNothingGenerated,
} from './presenter.ts'
import { createStepReporter } from './step-reporter.ts'

/**
 * Everything a run reads from outside: arguments, terminal, working directory, clock, the user
 * agent of the package manager that started it, and the commands it runs after writing.
 */
export type CreateEnvironment = {
  argv: readonly string[]
  /** Loads the base project, categories, built-in plugins and version catalog of the package. */
  loadAssets: () => Promise<Assets>
  cliVersion: string
  cwd: string
  streams: Streams & { error: Writable }
  isInteractive: boolean
  columns: number
  now: () => Date
  userAgent: string | undefined
  runCommand: CommandRunner
  remote: RemoteEnvironment
  /** Where the user configuration with trusted sources and registries lives. */
  userConfigPath: string
  /** The latest published version for the banner; answers nothing when unknown. */
  fetchLatestVersion: () => Promise<string | undefined>
  /** The value of `NEXT_SUITE_ENGINE`, which selects the engine; `v2` assembles from `plugin.ts`. */
  engine: string | undefined
  /** Loads the base project and the built-in plugins written as `plugin.ts`, for engine `v2`. */
  loadEngineV2Assets: () => Promise<EngineV2Assets>
}

/** Everything one run knows once the command line is read. */
type Run = {
  environment: CreateEnvironment
  /** The assets of the package, with the external plugins among its plugins. */
  assets: Assets
  /** The assets of engine `v2`, when it is selected. */
  engineV2: EngineV2Assets | undefined
  /** The plugins the questions offer. */
  plugins: ParsedPluginManifest[]
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
  selected: LoadedPlugin[]
}

/** The plugins the questions offer: with engine `v2`, each in its `plugin.ts` form where it has one. */
const offeredPlugins = (
  assets: Assets,
  engineV2: EngineV2Assets | undefined,
): ParsedPluginManifest[] => {
  const manifests = assets.plugins.map((plugin) => plugin.manifest)
  return engineV2 === undefined
    ? manifests
    : questionPlugins(
        manifests,
        engineV2.plugins.map(({ plugin }) => plugin),
      )
}

/**
 * The questions this run can ask: those of the offered plugins, and the settings only when a base
 * project exists to apply them to. The package manager that started the run becomes the default.
 * Engine `v2` takes its categories from the core.
 */
const prepareQuestions = (
  assets: Assets,
  {
    plugins,
    engineV2,
    userAgent,
  }: {
    plugins: readonly ParsedPluginManifest[]
    engineV2: EngineV2Assets | undefined
    userAgent: string | undefined
  },
) => {
  const canGenerate = assets.base !== undefined
  const detectedPackageManager = findUsablePackageManager(plugins, detectPackageManager(userAgent))
  const questions = buildQuestions({
    categories: preferPackageManager(
      engineV2 === undefined ? assets.categories : CATEGORIES,
      detectedPackageManager,
    ),
    plugins,
    settings: canGenerate ? BASE_SETTINGS : [],
    runSettings: canGenerate ? RUN_SETTINGS : [],
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

/** Composes the project in memory, once its plugins are trusted; engine `v2` assembles it. */
const composePlan = async (
  { environment, assets, engineV2, invocation, questions, presenter }: Run,
  { projectName, answers, selected }: Project,
  base: LoadedPlugin,
): Promise<ProjectPlan> => {
  const recordedAnswers = recordAnswers(questions, answers)
  if (engineV2 !== undefined) {
    return planV2Project({
      assets: engineV2,
      projectName,
      answers,
      recordedAnswers,
      cliVersion: environment.cliVersion,
      createdAt: environment.now(),
    })
  }
  await confirmTrust({
    plugins: selected,
    isDryRun: invocation.flags.dryRun === true,
    flagPatterns: invocation.flags.trust ?? [],
    userConfigPath: environment.userConfigPath,
    streams: presenter.isFramed ? environment.streams : undefined,
  })
  return composeProject({
    projectName,
    base,
    available: assets.plugins,
    selected,
    answers,
    logic: await loadLogic([base, ...selected]),
    recordedAnswers,
    catalog: assets.catalog,
    cliVersion: environment.cliVersion,
    createdAt: environment.now(),
  })
}

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
 * Runs the steps of create-next-suite: ask the questions, compose the project in memory, write
 * it, then initialize git, install and commit.
 */
const create = async (run: Run): Promise<void> => {
  const { environment, assets, invocation, presenter } = run
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
  if (assets.base === undefined) {
    presentNothingGenerated(presenter)
    return
  }
  const project: Project = {
    directory,
    projectName: projectNameOf(directory, cwd),
    action,
    answers,
    selected: answers.plugins.flatMap((answer) =>
      assets.plugins.filter((plugin) => plugin.manifest.name === answer.name),
    ),
  }
  const plan = await composePlan(run, project, assets.base)
  if (invocation.flags.dryRun) {
    const report = describePlan(plan)
    presentDryRun(presenter, invocation.flags.diff ? `${report}\n\n${diffPlan(plan)}` : report)
    return
  }
  await writeAndFinish(run, project, plan)
}

/** The assets of the package together with the external plugins the command line names. */
const loadRunAssets = async (environment: CreateEnvironment): Promise<Assets> => {
  const assets = await environment.loadAssets()
  const { registries } = await readUserConfig(environment.userConfigPath)
  const external = await loadExternalPlugins(readPluginAddresses(environment.argv), {
    cwd: environment.cwd,
    remote: environment.remote,
    registries,
  })
  const plugins = [...assets.plugins, ...external]
  assertUniqueNames(
    [...(assets.base === undefined ? [] : [assets.base]), ...plugins].map(namedPlugin),
  )
  return { ...assets, plugins }
}

/**
 * The assets of engine `v2` when `NEXT_SUITE_ENGINE` selects it, which runs built-in plugins only.
 *
 * @throws InputError for another value than `v1` or `v2`, or `--plugin` with engine `v2`.
 */
const loadEngineV2 = async (
  environment: CreateEnvironment,
): Promise<EngineV2Assets | undefined> => {
  if (selectEngine(environment.engine) === 'v1') {
    return undefined
  }
  if (readPluginAddresses(environment.argv).length > 0) {
    throw new InputError(
      `--plugin loads no plugins while ${ENGINE_VARIABLE} is v2; unset it to load other plugins`,
    )
  }
  return environment.loadEngineV2Assets()
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
    const engineV2 = await loadEngineV2(environment)
    const assets = await loadRunAssets(environment)
    const plugins = offeredPlugins(assets, engineV2)
    const { questions, detectedPackageManager } = prepareQuestions(assets, {
      plugins,
      engineV2,
      userAgent: environment.userAgent,
    })
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
      engineV2,
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
