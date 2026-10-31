import { resolve } from 'node:path'
import type { Writable } from 'node:stream'

import { CommanderError } from 'commander'
import type { Answers } from '../answers/answers.ts'
import type { TargetAction } from '../answers/target-action.ts'
import { InputError } from '../input-error.ts'
import type { FetchedPlugin } from '../loader/fetch-external-plugin.ts'
import type { LoadedExternalPlugin } from '../loader/load-external-plugin.ts'
import type { LoadedPluginModule } from '../loader/load-plugin-module.ts'
import type { RemoteEnvironment } from '../loader/remote/remote-source.ts'
import type { Plugin } from '../plugin-definition/plugin-definition.ts'
import type { CommandRunner } from '../post-steps/run-command.ts'
import { runPostSteps } from '../post-steps/run-post-steps.ts'
import { type LoadedSuiteConfig, loadSuiteConfig } from '../project-config/load-suite-config.ts'
import { rehashGeneratedFiles } from '../project-config/rehash-generated-files.ts'
import type { Question } from '../questions/build-questions.ts'
import { collectAnswers } from '../questions/collect-answers.ts'
import { createFlags } from '../questions/flags.ts'
import { findProjectDirectoryProblem, projectNameOf } from '../questions/project-directory.ts'
import { GIT_SETTING, INSTALL_SETTING } from '../questions/run-settings.ts'
import { PromptCancelledError } from '../ui/prompt-cancelled-error.ts'
import type { Streams } from '../ui/prompts.ts'
import { findEmptyingProblem } from '../write/empty-target.ts'
import { findTargetProblem, inspectTarget } from '../write/inspect-target.ts'
import { writeProject } from '../write/write-project.ts'
import { answersFromConfig } from './answers-from-config.ts'
import type { BuiltInAssets } from './built-in-assets.ts'
import {
  type GivenAnswers,
  type Invocation,
  parseCommandLine,
  RESERVED_NAMES,
  readConfigPath,
  readGivenAnswers,
  readPluginAddresses,
  targetActionOf,
} from './command-line.ts'
import { CREATE_COMMAND } from './command-name.ts'
import { type ConfigAddress, configAddresses } from './config-addresses.ts'
import { configEntryOf } from './config-entry-of.ts'
import { describeError } from './describe-error.ts'
import { describePlan, diffPlan } from './describe-plan.ts'
import { EXIT_CANCELLED, EXIT_FAILURE, EXIT_SUCCESS } from './exit-code.ts'
import { fetchExternalPlugins } from './fetch-external-plugins.ts'
import { listNextSteps } from './list-next-steps.ts'
import { loadSelectedExternal } from './load-selected-external.ts'
import { type ExternalRunPlugin, planProject } from './plan-project.ts'
import { prepareQuestions } from './prepare-questions.ts'
import {
  openFrame,
  type Presenter,
  presentCancelled,
  presentCreated,
  presentDryRun,
  presentFailure,
} from './presenter.ts'
import type { ProjectPlan } from './project-plan.ts'
import { readConfigSource } from './read-config-source.ts'
import { createStepReporter } from './step-reporter.ts'

/**
 * Everything a run reads from outside: arguments, terminal, working directory, the user agent of
 * the package manager that started it, the network and user configuration external plugins come
 * with, and the commands it runs after writing.
 */
export type CreateEnvironment = {
  argv: readonly string[]
  /** Loads the base project and the built-in plugins of the package. */
  loadAssets: () => Promise<BuiltInAssets>
  /** The entry external plugins import `create-next-suite/plugin` from. */
  pluginEntry: string
  /** The entry a project's config imports `create-next-suite/config` from. */
  configEntry: string
  /** How external plugins are fetched: the network, the cache directory and access tokens. */
  remote: RemoteEnvironment
  /** Where the user configuration with trusted sources and registries lives. */
  userConfigPath: string
  cliVersion: string
  /** What a new project's devDependency on create-next-suite names: the running version. */
  cliSpecifier: string
  cwd: string
  streams: Streams & { error: Writable }
  isInteractive: boolean
  columns: number
  userAgent: string | undefined
  runCommand: CommandRunner
  /** The latest published version for the banner; answers nothing when unknown. */
  fetchLatestVersion: () => Promise<string | undefined>
}

/** Everything one run knows once the command line is read. */
type Run = {
  environment: CreateEnvironment
  assets: BuiltInAssets
  /** The config the project is created from, given with `--config`. */
  suiteConfig: LoadedSuiteConfig | undefined
  /** The plugins the config defines in place. */
  inlinePlugins: readonly LoadedPluginModule[]
  /** The external plugins the command line or the config names, fetched and read but not run. */
  external: FetchedPlugin[]
  /** The entries of the config that name external plugins, with their addresses. */
  configAddresses: ConfigAddress[]
  /**
   * The plugins the questions offer: the built-in ones, those the config defines in place, and the
   * metadata of the external ones.
   */
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
  suiteConfig,
  plugins,
  invocation,
  given,
  questions,
  detectedPackageManager,
  presenter,
}: Run) => {
  const { cwd } = environment
  const check: DirectoryCheck = { cwd, action: targetActionOf(invocation) }
  const directory = invocation.directory ?? suiteConfig?.config.project.name
  if (directory !== undefined) {
    assertUsableDirectory(directory, check)
  }
  return collectAnswers({
    directory,
    action: check.action,
    hasExistingFiles: (directory) => inspectTarget(resolve(cwd, directory)) === 'not-empty',
    questions,
    plugins,
    ...given,
    mode:
      presenter.isFramed && suiteConfig === undefined
        ? {
            kind: 'wizard',
            streams: environment.streams,
            findDirectoryProblem: (directory: string) => findDirectoryProblem(directory, check),
            canEmpty: (directory: string) =>
              findEmptyingProblem(resolve(cwd, directory), cwd) === undefined,
            detectedPackageManager,
          }
        : {
            kind: 'input',
            useDefaults: invocation.flags.yes === true || suiteConfig !== undefined,
          },
  })
}

/** Assembles the project in memory. */
const planRun = async (
  run: Run,
  { directory, projectName, answers }: Project,
  externalPlugins: readonly LoadedExternalPlugin[],
): Promise<ProjectPlan> => {
  const { environment, assets, inlinePlugins, suiteConfig } = run
  const projectDirectory = resolve(environment.cwd, directory)
  const external = externalPlugins.map(
    (plugin): ExternalRunPlugin => ({
      ...plugin,
      entry:
        run.configAddresses.find(({ address }) => address === plugin.address)?.entry ??
        configEntryOf(plugin, { cwd: environment.cwd, projectDirectory }),
    }),
  )
  return planProject({
    assets,
    externalPlugins: external,
    inlinePlugins,
    projectName,
    answers,
    cliVersion: environment.cliVersion,
    cliSpecifier: environment.cliSpecifier,
    configSource: suiteConfig === undefined ? undefined : await readConfigSource(suiteConfig),
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
    afterScripts: () => rehashGeneratedFiles(target),
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
    projectName: run.suiteConfig?.config.project.name ?? projectNameOf(directory, cwd),
    action,
    answers,
  }
  const external = await loadSelectedExternal({
    external: run.external,
    answers,
    known: [...run.assets.plugins, ...run.inlinePlugins],
    flagPatterns: invocation.flags.trust ?? [],
    streams: presenter.isFramed ? environment.streams : undefined,
    environment,
  })
  const plan = await planRun(run, project, external)
  if (invocation.flags.dryRun) {
    const report = describePlan(plan)
    presentDryRun(presenter, invocation.flags.diff ? `${report}\n\n${diffPlan(plan)}` : report)
    return
  }
  await writeAndFinish(run, project, plan)
}

/** The answers given before any question: from the config with `--config`, else from the input. */
const readRunAnswers = async (
  invocation: Invocation,
  context: {
    environment: CreateEnvironment
    questionFlags: ReturnType<typeof createFlags>
    config:
      | {
          loaded: LoadedSuiteConfig
          plugins: Plugin[]
          external: FetchedPlugin[]
          addresses: ConfigAddress[]
        }
      | undefined
  },
): Promise<GivenAnswers> => {
  const given = await readGivenAnswers(invocation, {
    cwd: context.environment.cwd,
    questionFlags: context.questionFlags,
  })
  const { config } = context
  if (config === undefined) {
    return given
  }
  const fetched = config.addresses.flatMap(({ entry, address }) => {
    const plugin = config.external.find((candidate) => candidate.address === address)
    return plugin === undefined ? [] : [{ entry, address, name: plugin.summary.metadata.name }]
  })
  const fromConfig = answersFromConfig({
    loaded: config.loaded,
    plugins: config.plugins,
    fetched,
    flagKeys: given.flagKeys,
  })
  return { input: { ...fromConfig, ...given.input }, flagKeys: given.flagKeys }
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
    const assets = await environment.loadAssets()
    const configPath = readConfigPath(environment.argv)
    const suiteConfig =
      configPath === undefined
        ? undefined
        : await loadSuiteConfig(resolve(environment.cwd, configPath), environment)
    const inlinePlugins = suiteConfig?.inlinePlugins ?? []
    const addresses = suiteConfig === undefined ? [] : configAddresses(suiteConfig)
    const external = await fetchExternalPlugins(environment, {
      addresses: [
        ...readPluginAddresses(environment.argv),
        ...addresses.map(({ address }) => address),
      ],
      known: [...assets.plugins, ...inlinePlugins],
    })
    const plugins = [
      ...assets.plugins.map(({ plugin }) => plugin),
      ...inlinePlugins.map(({ plugin }) => plugin),
      ...external.map(({ summary }) => summary.metadata),
    ]
    const { questions, detectedPackageManager } = prepareQuestions(plugins, environment.userAgent)
    const questionFlags = createFlags(questions, RESERVED_NAMES)
    const invocation = await parseCommandLine(
      { argv: environment.argv, cliVersion: environment.cliVersion, ...streams },
      questionFlags,
    )
    const given = await readRunAnswers(invocation, {
      environment,
      questionFlags,
      config:
        suiteConfig === undefined
          ? undefined
          : { loaded: suiteConfig, plugins, external, addresses },
    })
    presenter = { ...plain, isFramed: environment.isInteractive && invocation.flags.yes !== true }
    await create({
      environment,
      assets,
      suiteConfig,
      inlinePlugins,
      external,
      configAddresses: addresses,
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
