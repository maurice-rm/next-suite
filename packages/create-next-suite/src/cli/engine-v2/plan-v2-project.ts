import type { Answers, AnswerValue } from '../../answers/answers.ts'
import { optionsOf } from '../../answers/plugin-options.ts'
import { assembleProject } from '../../assembly/assemble-project.ts'
import type { PluginAnswers } from '../../assembly/resolve-answers.ts'
import type { RunSteps } from '../../assembly/run-steps.ts'
import type { ProjectPlan } from '../../compose/compose-project.ts'
import { createProjectManifest, PROJECT_MANIFEST_FILE } from '../../compose/project-manifest.ts'
import { importAliasOf, usesSourceDirectory } from '../../compose/project-values.ts'
import { InputError } from '../../input-error.ts'
import type { LoadedPluginModule } from '../../loader/load-plugin-module.ts'
import { CATEGORIES } from '../../plugin-definition/categories.ts'
import { CORE_OWNER, createProject, PROJECT_FILES } from '../../project-model/project.ts'
import { GIT_SETTING } from '../../questions/run-settings.ts'
import { BUILT_IN_PLUGIN_VERSION } from './built-in-plugin-version.ts'
import type { EngineV2Assets } from './engine-v2-assets.ts'
import { ENGINE_VARIABLE } from './select-engine.ts'

/** How the plan names the core, as the manifest engine does. */
const CORE_ORIGIN = 'create-next-suite'
const BASE_OWNER = 'base'
const BUILT_IN_SOURCE = 'builtin'
const REACT_COMPILER_SETTING = 'react-compiler'
const CACHE_COMPONENTS_SETTING = 'cache-components'
const DEFAULT_INSTALL_ARGS = ['install']
/** What the end of a run shows for the base project. */
const BASE_SUMMARY: ProjectPlan['summary'] = {
  stack: ['Next.js', 'TypeScript'],
  nextSteps: [{ script: 'dev' }],
}

type PlanInput = {
  assets: EngineV2Assets
  projectName: string
  answers: Answers
  /** The answers as next-suite.json records them. */
  recordedAnswers: Readonly<Record<string, unknown>>
  cliVersion: string
  createdAt: Date
}

type PackageJsonDependencies = {
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
}

const selectPlugins = ({
  assets,
  answers,
}: Pick<PlanInput, 'assets' | 'answers'>): LoadedPluginModule[] =>
  answers.plugins.map(({ name }) => {
    const loaded = assets.plugins.find(({ plugin }) => plugin.name === name)
    if (loaded === undefined) {
      throw new InputError(
        `${name} comes from --plugin, which ${ENGINE_VARIABLE}=v2 does not run yet; unset ${ENGINE_VARIABLE} to use it`,
      )
    }
    return loaded
  })

/** The answers to a plugin's options; the questions of a `plugin.ts` option never take a number. */
const pluginAnswersOf = (name: string, answers: Answers): PluginAnswers =>
  Object.fromEntries(
    Object.entries(optionsOf(name, answers)).flatMap(([key, value]: [string, AnswerValue]) =>
      typeof value === 'number' ? [] : [[key, value]],
    ),
  )

const answersOf = (plugins: readonly LoadedPluginModule[], answers: Answers) =>
  Object.fromEntries(
    plugins.map(({ plugin }) => [plugin.name, pluginAnswersOf(plugin.name, answers)]),
  )

/** The plan names the core for package.json, as the manifest engine, which writes it. */
const originOf = (path: string, owner: string): string =>
  owner === CORE_OWNER || (owner === BASE_OWNER && path === PROJECT_FILES.packageJson)
    ? CORE_ORIGIN
    : owner

/** The base project's stack first and its next steps last, as the manifest engine lists them. */
const summaryOf = (runSteps: RunSteps): ProjectPlan['summary'] => ({
  stack: [...new Set([...BASE_SUMMARY.stack, ...runSteps.stack])],
  nextSteps: [...runSteps.nextSteps, ...BASE_SUMMARY.nextSteps].filter(
    (step, index, steps) =>
      steps.findIndex((other) => JSON.stringify(other) === JSON.stringify(step)) === index,
  ),
})

const postStepsOf = (runSteps: RunSteps, answers: Answers): ProjectPlan['postSteps'] => {
  const run = { initializesGit: answers.settings[GIT_SETTING] === true }
  return runSteps.postSteps
    .filter((step) => step.runsFor(run))
    .map(({ script, running, done }) => ({ script, running, done }))
}

const dependenciesOf = (files: ReadonlyMap<string, string>): Required<PackageJsonDependencies> => {
  const packageJson: PackageJsonDependencies = JSON.parse(
    files.get(PROJECT_FILES.packageJson) ?? '{}',
  )
  return {
    dependencies: packageJson.dependencies ?? {},
    devDependencies: packageJson.devDependencies ?? {},
  }
}

/**
 * Plans a project with the engine of plugins written as `plugin.ts`: the base project as real
 * files, the base settings and the selected plugins, assembled in memory, with next-suite.json.
 * The plan has the form the manifest engine gives it, so writing and the steps after it stay the
 * same.
 *
 * @throws InputError when a selected plugin is none of the built-in plugins, such as one from
 * `--plugin`.
 */
export const planV2Project = (input: PlanInput): ProjectPlan => {
  const { assets, answers, projectName } = input
  const plugins = selectPlugins(input)
  const isSrcDirectory = usesSourceDirectory(answers)
  const importAlias = importAliasOf(answers)
  const project = createProject({
    files: assets.baseFiles,
    settings: { alias: importAlias, isSrcDirectory },
  })
  project.write(
    PROJECT_MANIFEST_FILE,
    createProjectManifest({
      cliVersion: input.cliVersion,
      createdAt: input.createdAt,
      plugins: plugins.map(({ plugin }) => ({
        name: plugin.name,
        source: BUILT_IN_SOURCE,
        version: BUILT_IN_PLUGIN_VERSION,
      })),
      answers: input.recordedAnswers,
    }),
    CORE_ORIGIN,
  )
  const {
    files,
    owners,
    runSteps,
    packageManager: projectPackageManager,
  } = assembleProject({
    project,
    plugins,
    categoryOrder: CATEGORIES.map(({ id }) => id),
    answers: answersOf(plugins, answers),
    baseSettings: {
      projectName,
      importAlias,
      isSrcDirectory,
      usesReactCompiler: answers.settings[REACT_COMPILER_SETTING] === true,
      usesCacheComponents: answers.settings[CACHE_COMPONENTS_SETTING] === true,
    },
  })
  const packageManager = plugins.find(({ plugin }) => plugin.packageManager !== undefined)?.plugin
  return {
    files: [...files].map(([path, content]) => ({
      path,
      content,
      origin: originOf(path, owners.get(path) ?? CORE_OWNER),
    })),
    ...dependenciesOf(files),
    packageManager: packageManager?.name,
    projectPackageManager: projectPackageManager.name,
    installArgs: [...(packageManager?.packageManager?.installArgs ?? DEFAULT_INSTALL_ARGS)],
    postSteps: postStepsOf(runSteps, answers),
    summary: summaryOf(runSteps),
  }
}
