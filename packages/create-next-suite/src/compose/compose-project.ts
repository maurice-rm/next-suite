import type { Answers } from '../answers/answers.ts'
import type { Logic } from '../contract/logic.ts'
import type { ParsedPluginManifest } from '../contract/plugin-manifest.ts'
import type { PostStep } from '../contract/post-step.ts'
import type { VersionCatalog } from '../contract/version-catalog.ts'
import type { LoadedPlugin } from '../loader/load-plugin.ts'
import { applyConditionalDependencies } from './apply-conditional-dependencies.ts'
import { assertNoPathCollisions } from './assert-no-path-collisions.ts'
import { assertScript } from './assert-script.ts'
import { compareNames } from './compare-names.ts'
import { ComposeError } from './compose-error.ts'
import { expandConditionalContributions } from './expand-conditional-contributions.ts'
import { collectFacts } from './facts.ts'
import { type CompositionValues, mergeContributions } from './merge-contributions.ts'
import { createPackageJson, PACKAGE_FILE } from './package-json.ts'
import { findPackageManager } from './package-manager-fields.ts'
import {
  addCoreFile,
  addInstrumentationFiles,
  addLogicFiles,
  addPluginFiles,
} from './project-files.ts'
import { createProjectManifest, PROJECT_MANIFEST_FILE } from './project-manifest.ts'
import { type ProjectValues, projectValues } from './project-values.ts'
import { resolveModules } from './resolve-modules.ts'
import { runLogic } from './run-logic.ts'
import { collectPostSteps, collectSummary, type RunSummary } from './run-summary.ts'
import { settingContributions } from './setting-contributions.ts'
import { templateValues } from './template-values.ts'
import type { VirtualFile, VirtualFiles } from './virtual-files.ts'

const DEFAULT_INSTALL_ARGS = ['install']

type ComposeInput = {
  projectName: string
  base: LoadedPlugin
  available: readonly LoadedPlugin[]
  selected: readonly LoadedPlugin[]
  answers: Answers
  /** The logic modules of the selected plugins that have one, already trusted and loaded. */
  logic: ReadonlyMap<string, Logic>
  recordedAnswers: Readonly<Record<string, unknown>>
  catalog: VersionCatalog
  cliVersion: string
  createdAt: Date
}

/** Everything a run will write, before it is written. */
export type ProjectPlan = {
  files: VirtualFile[]
  dependencies: Record<string, string>
  devDependencies: Record<string, string>
  /** The command of the selected package manager, if a package manager plugin is selected. */
  packageManager: string | undefined
  /** The package manager the commands of the project use: the selected one, npm without one. */
  projectPackageManager: string
  /** The arguments its first install runs with. */
  installArgs: string[]
  /** The scripts to run after the install, in plugin order, with what the run shows for them. */
  postSteps: PostStep[]
  summary: RunSummary
}

/** The manifests whose contributions merge: the base project, the base settings, the plugins. */
const contributingManifests = ({ base, selected, answers }: ComposeInput): ParsedPluginManifest[] =>
  [
    base.manifest,
    settingContributions(answers.settings),
    ...selected.map(({ manifest }) => manifest),
  ]
    .map((manifest) => applyConditionalDependencies(manifest, answers))
    .flatMap((manifest) => expandConditionalContributions(manifest, answers))

const assertValuesFit = (values: CompositionValues, project: ProjectValues): void => {
  for (const check of values.ciChecks) {
    assertScript(values.scripts, check, 'a plugin runs in CI the script')
  }
  if (values.tsconfig.paths.some(({ key }) => key === project.importAlias)) {
    throw new ComposeError(
      `a plugin redefines the tsconfig path "${project.importAlias}", the project's import alias`,
    )
  }
}

/**
 * Composes the project in memory: merges the contributions of the base project and the selected
 * plugins, renders their files, and adds package.json and next-suite.json. Nothing is written.
 */
export const composeProject = async (input: ComposeInput): Promise<ProjectPlan> => {
  const { answers, catalog } = input
  const plugins = [input.base, ...input.selected]
  const packageManager = findPackageManager(input.selected)
  const project = projectValues({
    projectName: input.projectName,
    answers,
    packageManager,
    catalog,
  })
  const facts = collectFacts([input.base, ...input.available], answers)
  const { logicManifests, files: logicFiles } = await runLogic({
    manifests: plugins.map(({ manifest }) => manifest),
    logic: input.logic,
    answers,
    project,
    facts,
  })
  const manifests = [...contributingManifests(input), ...logicManifests]
  const values = resolveModules(mergeContributions(manifests, catalog), project.importPrefix)
  assertValuesFit(values, project)

  const files: VirtualFiles = new Map()
  await addPluginFiles(files, plugins, {
    project,
    answers,
    values: templateValues(values),
    facts,
  })
  addLogicFiles(files, { logicFiles, plugins, answers })
  addInstrumentationFiles(files, values, answers)
  addCoreFile(
    files,
    PACKAGE_FILE,
    createPackageJson({
      projectName: input.projectName,
      values,
      packageManager,
      catalog,
    }),
  )
  addCoreFile(
    files,
    PROJECT_MANIFEST_FILE,
    createProjectManifest({
      cliVersion: input.cliVersion,
      createdAt: input.createdAt,
      plugins: input.selected,
      answers: input.recordedAnswers,
    }),
  )
  assertNoPathCollisions(files)

  return {
    files: [...files.values()].sort((first, second) => compareNames(first.path, second.path)),
    dependencies: values.dependencies,
    devDependencies: values.devDependencies,
    packageManager: packageManager?.name,
    projectPackageManager: project.packageManager,
    installArgs: packageManager?.packageManager.installArgs ?? DEFAULT_INSTALL_ARGS,
    postSteps: collectPostSteps(
      plugins.map(({ manifest }) => manifest),
      answers,
      values.scripts,
    ),
    summary: collectSummary({
      manifests,
      baseName: input.base.manifest.name,
      answers,
      scripts: values.scripts,
    }),
  }
}
