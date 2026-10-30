import type { Answers } from '../answers/answers.ts'
import { optionsOf } from '../answers/plugin-options.ts'
import { assembleProject } from '../assembly/assemble-project.ts'
import type { RunSteps } from '../assembly/run-steps.ts'
import { InputError } from '../input-error.ts'
import type { LoadedExternalPlugin } from '../loader/load-external-plugin.ts'
import type { LoadedPluginModule } from '../loader/load-plugin-module.ts'
import { CATEGORIES } from '../plugin-definition/categories.ts'
import { CORE_OWNER, createProject, PROJECT_FILES } from '../project-model/project.ts'
import { GIT_SETTING } from '../questions/run-settings.ts'
import type { BuiltInAssets } from './built-in-assets.ts'
import { createProjectManifest, PROJECT_MANIFEST_FILE } from './project-manifest.ts'
import type { ProjectPlan } from './project-plan.ts'

/** How the plan names the core. */
const CORE_ORIGIN = 'create-next-suite'
const BASE_OWNER = 'base'
const BUILT_IN_SOURCE = 'builtin'
/** The version next-suite.json records for a built-in plugin. */
const BUILT_IN_PLUGIN_VERSION = '1.0.0'
const SRC_DIR_SETTING = 'src-dir'
const IMPORT_ALIAS_SETTING = 'import-alias'
const REACT_COMPILER_SETTING = 'react-compiler'
const CACHE_COMPONENTS_SETTING = 'cache-components'
const DEFAULT_IMPORT_ALIAS = '@/*'
/** An alias such as `@/*` or `~/*`: no spaces or quotes, ending in `/*` like create-next-app. */
const IMPORT_ALIAS = /^[^\s"'\\]+\/\*$/
const DEFAULT_INSTALL_ARGS = ['install']
/** What the end of a run shows for the base project. */
const BASE_SUMMARY: ProjectPlan['summary'] = {
  stack: ['Next.js', 'TypeScript'],
  nextSteps: [{ script: 'dev' }],
}

type PlanInput = {
  assets: BuiltInAssets
  /** The selected external plugins, trusted and run. */
  externalPlugins: readonly LoadedExternalPlugin[]
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

/**
 * The import alias the answers set, such as `@/*`.
 *
 * @throws InputError for an alias that does not end in `/*` or holds spaces or quotes.
 */
const importAliasOf = (answers: Answers): string => {
  const alias = answers.settings[IMPORT_ALIAS_SETTING]
  const importAlias = typeof alias === 'string' ? alias : DEFAULT_IMPORT_ALIAS
  if (!IMPORT_ALIAS.test(importAlias)) {
    throw new InputError(
      `the import alias "${importAlias}" is invalid; use a pattern such as "@/*" or "~/*"`,
    )
  }
  return importAlias
}

/** A plugin of the run with what next-suite.json records about its source. */
type RunPlugin = { module: LoadedPluginModule; source: string; resolved: string | undefined }

/** The selected plugins, built-in and external, in the order the answers name them. */
const selectPlugins = ({
  assets,
  externalPlugins,
  answers,
}: Pick<PlanInput, 'assets' | 'externalPlugins' | 'answers'>): RunPlugin[] => {
  const available: RunPlugin[] = [
    ...assets.plugins.map((module) => ({ module, source: BUILT_IN_SOURCE, resolved: undefined })),
    ...externalPlugins.map(({ module, address, resolved }) => ({
      module,
      source: address,
      resolved,
    })),
  ]
  return answers.plugins.flatMap(({ name }) =>
    available.filter(({ module }) => module.plugin.name === name),
  )
}

const answersOf = (plugins: readonly LoadedPluginModule[], answers: Answers) =>
  Object.fromEntries(plugins.map(({ plugin }) => [plugin.name, optionsOf(plugin.name, answers)]))

/** The plan names the core for package.json, which it writes from the base project's. */
const originOf = (path: string, owner: string): string =>
  owner === CORE_OWNER || (owner === BASE_OWNER && path === PROJECT_FILES.packageJson)
    ? CORE_ORIGIN
    : owner

/** The base project's stack first and its next steps last. */
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
 * Plans a project: the base project as real files, the base settings and the selected built-in
 * and external plugins, assembled in memory, with next-suite.json. Nothing is written.
 *
 * @throws InputError for an invalid import alias.
 */
export const planProject = (input: PlanInput): ProjectPlan => {
  const { assets, answers, projectName } = input
  const selected = selectPlugins(input)
  const plugins = selected.map(({ module }) => module)
  const isSrcDirectory = answers.settings[SRC_DIR_SETTING] === true
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
      plugins: selected.map(({ module, source, resolved }) => ({
        name: module.plugin.name,
        source,
        resolved,
        version: source === BUILT_IN_SOURCE ? BUILT_IN_PLUGIN_VERSION : undefined,
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
