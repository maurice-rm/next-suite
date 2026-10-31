import type { Answers } from '../answers/answers.ts'
import { optionsOf } from '../answers/plugin-options.ts'
import { assembleProject } from '../assembly/assemble-project.ts'
import type { RunSteps } from '../assembly/run-steps.ts'
import { InputError } from '../input-error.ts'
import type { LoadedExternalPlugin } from '../loader/load-external-plugin.ts'
import type { LoadedPluginModule } from '../loader/load-plugin-module.ts'
import { CATEGORIES } from '../plugin-definition/categories.ts'
import { applyOverrides } from '../project-config/apply-overrides.ts'
import { describeGeneration } from '../project-config/describe-generation.ts'
import {
  BUILT_IN_SOURCE,
  INLINE_SOURCE,
  type LockedPlugin,
  type LockedProject,
} from '../project-config/lock-file.ts'
import { CLI_PACKAGE, PROJECT_PATHS } from '../project-config/project-paths.ts'
import { renderSuiteConfig } from '../project-config/render-suite-config.ts'
import { CORE_OWNER, createProject, PROJECT_FILES } from '../project-model/project.ts'
import { GIT_SETTING } from '../questions/run-settings.ts'
import type { BuiltInAssets } from './built-in-assets.ts'
import type { ProjectPlan } from './project-plan.ts'

/** How the plan names the core. */
const CORE_ORIGIN = 'create-next-suite'
const BASE_OWNER = 'base'
/** How the plan names the files of the project's own: its config and what lies under next-suite/. */
const PROJECT_ORIGIN = 'project'
const OVERRIDE_ORIGIN = 'override'
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

/** An external plugin of the run, with the entry the project's config names it by. */
export type ExternalRunPlugin = LoadedExternalPlugin & {
  /** The address, or the path of a local directory relative to the project. */
  entry: string
}

/** The config a project is created from, and the project's own files beside it. */
export type ConfigSource = {
  /** The config's text, which the project gets unchanged. */
  text: string
  /** The project's files under `next-suite/` by project path: its plugins and overrides. */
  inputs: ReadonlyMap<string, string>
  /** The plugins the config disables. */
  disable: readonly string[]
}

type PlanInput = {
  assets: BuiltInAssets
  /** The selected external plugins, trusted and run. */
  externalPlugins: readonly ExternalRunPlugin[]
  /** The plugins the project's config defines in place. */
  inlinePlugins: readonly LoadedPluginModule[]
  projectName: string
  answers: Answers
  cliVersion: string
  /** What the project's devDependency on create-next-suite names: the running version by default. */
  cliSpecifier: string
  /** The config the project is created from; without one, a new config is written. */
  configSource: ConfigSource | undefined
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

/** A plugin of the run, the entry the project's config names it by and what the lock records. */
type RunPlugin = { module: LoadedPluginModule; entry: string | undefined; locked: LockedPlugin }

const externalRunPlugin = ({
  module,
  entry,
  resolved,
  contentHash,
}: ExternalRunPlugin): RunPlugin => ({
  module,
  entry,
  locked: {
    name: module.plugin.name,
    source: entry,
    ...(resolved === undefined ? {} : { resolved }),
    contentHash,
  },
})

/** The selected plugins, built-in, external and inline, in the order the answers name them. */
const selectPlugins = (input: PlanInput): RunPlugin[] => {
  const available: RunPlugin[] = [
    ...input.assets.plugins.map(
      (module): RunPlugin => ({
        module,
        entry: module.plugin.name,
        locked: { name: module.plugin.name, source: BUILT_IN_SOURCE, version: input.cliVersion },
      }),
    ),
    ...input.externalPlugins.map(externalRunPlugin),
    ...input.inlinePlugins.map(
      (module): RunPlugin => ({
        module,
        entry: undefined,
        locked: { name: module.plugin.name, source: INLINE_SOURCE },
      }),
    ),
  ]
  return input.answers.plugins.flatMap(({ name }) =>
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

const lockedProjectOf = (input: PlanInput, importAlias: string): LockedProject => ({
  name: input.projectName,
  srcDir: input.answers.settings[SRC_DIR_SETTING] === true,
  importAlias,
  reactCompiler: input.answers.settings[REACT_COMPILER_SETTING] === true,
  cacheComponents: input.answers.settings[CACHE_COMPONENTS_SETTING] === true,
})

/** The project's config as given, or a new one naming every selected plugin and answer. */
const configTextOf = (
  input: PlanInput,
  { project, plugins }: { project: LockedProject; plugins: readonly RunPlugin[] },
): string =>
  input.configSource?.text ??
  renderSuiteConfig({
    project,
    plugins: plugins.flatMap(({ entry }) => entry ?? []),
    answers: answersOf(
      plugins.map(({ module }) => module),
      input.answers,
    ),
  })

/**
 * Plans a project: the base project as real files, the base settings and the selected built-in,
 * external and inline plugins, assembled in memory, with the project's overrides applied. The
 * project gets its config, its lock and registry types under `.next-suite/`, and a devDependency
 * on create-next-suite. Nothing is written.
 *
 * @throws InputError for an invalid import alias.
 * @throws ProjectConfigError for an override of a file the project does not generate.
 */
export const planProject = (input: PlanInput): ProjectPlan => {
  const { assets, answers, projectName } = input
  const selected = selectPlugins(input)
  const plugins = selected.map(({ module }) => module)
  const importAlias = importAliasOf(answers)
  const lockedProject = lockedProjectOf(input, importAlias)
  const project = createProject({
    files: assets.baseFiles,
    settings: { alias: importAlias, isSrcDirectory: lockedProject.srcDir },
  })
  project.packageJson().addDevDependency(CLI_PACKAGE, input.cliSpecifier, CORE_ORIGIN)
  project.tsconfig().addInclude(PROJECT_PATHS.registryTypes)
  const inputs = input.configSource?.inputs ?? new Map<string, string>()
  const assembled = assembleProject({
    project,
    plugins,
    categoryOrder: CATEGORIES.map(({ id }) => id),
    answers: answersOf(plugins, answers),
    baseSettings: {
      projectName,
      importAlias,
      isSrcDirectory: lockedProject.srcDir,
      usesReactCompiler: lockedProject.reactCompiler,
      usesCacheComponents: lockedProject.cacheComponents,
    },
    ...(inputs.size > 0 ? { projectInputDirectory: PROJECT_PATHS.inputDirectory } : {}),
  })
  const generated = applyOverrides(assembled, inputs)
  const description = describeGeneration({
    generatorVersion: input.cliVersion,
    project: lockedProject,
    plugins: selected.map(({ locked }) => locked),
    disable: input.configSource?.disable ?? [],
    answers: answersOf(plugins, answers),
    generated,
    availablePlugins: [
      ...assets.plugins,
      ...input.externalPlugins.map(({ module }) => module),
      ...input.inlinePlugins,
    ].map(({ plugin }) => plugin),
  })
  const configOrigin = input.configSource === undefined ? CORE_ORIGIN : PROJECT_ORIGIN
  const packageManager = plugins.find(({ plugin }) => plugin.packageManager !== undefined)?.plugin
  const files = [
    ...[...generated.files].map(([path, content]) => ({
      path,
      content,
      origin:
        content === assembled.files.get(path)
          ? originOf(path, assembled.owners.get(path) ?? CORE_OWNER)
          : OVERRIDE_ORIGIN,
    })),
    {
      path: PROJECT_PATHS.config,
      content: configTextOf(input, { project: lockedProject, plugins: selected }),
      origin: configOrigin,
    },
    ...[...description].map(([path, content]) => ({ path, content, origin: CORE_ORIGIN })),
    ...[...inputs].map(([path, content]) => ({ path, content, origin: PROJECT_ORIGIN })),
  ].sort((left, right) => (left.path < right.path ? -1 : 1))
  return {
    files,
    ...dependenciesOf(generated.files),
    packageManager: packageManager?.name,
    projectPackageManager: assembled.packageManager.name,
    installArgs: [...(packageManager?.packageManager?.installArgs ?? DEFAULT_INSTALL_ARGS)],
    postSteps: postStepsOf(assembled.runSteps, answers),
    summary: summaryOf(assembled.runSteps),
  }
}
