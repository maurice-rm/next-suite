import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import type { Answers, AnswerValue } from '../answers/answers.ts'
import { evaluateCondition } from '../answers/evaluate-condition.ts'
import type { ParsedPluginManifest } from '../contract/plugin-manifest.ts'
import type { VersionCatalog } from '../contract/version-catalog.ts'
import type { LoadedPlugin } from '../loader/load-plugin.ts'
import { assertNoPathCollisions } from './assert-no-path-collisions.ts'
import { assertSafeTarget } from './assert-safe-target.ts'
import { compareNames } from './compare-names.ts'
import { ComposeError } from './compose-error.ts'
import { type CompositionValues, mergeContributions } from './merge-contributions.ts'
import { packageManagerFields } from './package-manager-fields.ts'
import { createProjectManifest, PROJECT_MANIFEST_FILE } from './project-manifest.ts'
import { settingContributions } from './setting-contributions.ts'
import {
  BASE_TEMPLATE_BLOCKS,
  type BlockHelper,
  PLUGIN_TEMPLATE_BLOCKS,
} from './template/check-template.ts'
import { collectFacts } from './template/collect-facts.ts'
import { type Facts, renderTemplate } from './template/render-template.ts'
import { addFile, type VirtualFile, type VirtualFiles } from './virtual-files.ts'

const CORE_ORIGIN = 'create-next-suite'
const SOURCE_DIRECTORY = 'src'
const SRC_DIR_SETTING = 'src-dir'
const IMPORT_ALIAS_SETTING = 'import-alias'
const DEFAULT_IMPORT_ALIAS = '@/*'
/** An alias such as `@/*` or `~/*`: no spaces or quotes, ending in `/*` like create-next-app. */
const IMPORT_ALIAS = /^[^\s"'\\]+\/\*$/
const FALLBACK_PACKAGE_MANAGER = 'npm'
const PACKAGE_FILE = 'package.json'

type ComposeInput = {
  projectName: string
  base: LoadedPlugin
  available: readonly LoadedPlugin[]
  selected: readonly LoadedPlugin[]
  answers: Answers
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
  /** The scripts to run after the install, in plugin order, with what the run shows for them. */
  postSteps: PostStepScript[]
  /** What the end of the run shows: the stack line and the suggested next commands. */
  summary: { stack: string[]; nextSteps: NextStep[] }
}

/** A plugin script that runs after the install, with what the run says while and after it runs. */
type PostStepScript = { script: string; running: string; done: string }

/** A command the end of a run suggests: plain, or a script run with the package manager. */
export type NextStep = { command: string } | { script: string }

type PluginFile = NonNullable<ParsedPluginManifest['files']>[number]

/** Values about the project itself that templates read under `project`. */
type ProjectValues = {
  name: string
  /** The import alias, such as `@/*`, and the folder it points to, such as `./src/*`. */
  importAlias: string
  importAliasTarget: string
  packageManager: string
  /** How a script runs with the package manager, such as `pnpm run`. */
  run: string
}

type RenderContext = {
  project: ProjectValues
  answers: Answers
  values: CompositionValues
  facts: Facts
}

const optionsOf = (pluginName: string, answers: Answers): Record<string, AnswerValue> => {
  const prefix = `${pluginName}.`
  return Object.fromEntries(
    Object.entries(answers.options)
      .filter(([key]) => key.startsWith(prefix))
      .map(([key, value]) => [key.slice(prefix.length), value]),
  )
}

const requiredPlugins = (manifest: ParsedPluginManifest): ReadonlySet<string> =>
  new Set(
    (manifest.requires ?? []).flatMap((rule) => ('plugin' in rule.when ? [rule.when.plugin] : [])),
  )

const targetPath = (file: PluginFile, answers: Answers): string =>
  file.root === 'source' && answers.settings[SRC_DIR_SETTING] === true
    ? `${SOURCE_DIRECTORY}/${file.target}`
    : file.target

type FileToRender = {
  plugin: LoadedPlugin
  file: PluginFile
  context: RenderContext
  allowedBlocks: readonly BlockHelper[]
}

/** Plugin sources with this extension are templates; every other source is copied as it is. */
const TEMPLATE_EXTENSION = '.hbs'

const readPluginFile = async ({
  plugin,
  file,
  context,
  allowedBlocks,
}: FileToRender): Promise<string> => {
  const source = await readFile(join(plugin.folder, file.source), 'utf8')
  if (!file.source.endsWith(TEMPLATE_EXTENSION)) {
    return source
  }
  const values = {
    project: context.project,
    settings: context.answers.settings,
    options: optionsOf(plugin.manifest.name, context.answers),
    ...context.values,
  }
  try {
    return renderTemplate({
      source,
      values,
      facts: context.facts,
      allowedBlocks,
    })
  } catch (error) {
    throw new ComposeError(`${plugin.manifest.name}: ${file.source} does not render`, {
      cause: error,
    })
  }
}

const addPluginFiles = async (
  files: VirtualFiles,
  plugins: readonly LoadedPlugin[],
  context: RenderContext,
): Promise<void> => {
  const [base] = plugins
  const contributions = plugins.flatMap((plugin) =>
    (plugin.manifest.files ?? [])
      .filter((file) => file.when === undefined || evaluateCondition(file.when, context.answers))
      .map((file) => ({ plugin, file })),
  )
  const ordered = [
    ...contributions.filter(({ file }) => file.conflict !== 'replace'),
    ...contributions.filter(({ file }) => file.conflict === 'replace'),
  ]
  for (const { plugin, file } of ordered) {
    const path = targetPath(file, context.answers)
    assertSafeTarget(path, plugin.manifest.name)
    addFile(files, {
      path,
      content: await readPluginFile({
        plugin,
        file,
        context,
        allowedBlocks: plugin === base ? BASE_TEMPLATE_BLOCKS : PLUGIN_TEMPLATE_BLOCKS,
      }),
      origin: plugin.manifest.name,
      conflict: file.conflict,
      replaceable: requiredPlugins(plugin.manifest),
    })
  }
}

type PackageJsonInput = {
  projectName: string
  values: CompositionValues
  selected: readonly LoadedPlugin[]
  catalog: VersionCatalog
}

const findPackageManager = (selected: readonly LoadedPlugin[]) =>
  selected.flatMap(({ manifest }) =>
    manifest.packageManager === undefined
      ? []
      : [{ name: manifest.name, packageManager: manifest.packageManager }],
  )[0]

const createPackageJson = ({
  projectName,
  values,
  selected,
  catalog,
}: PackageJsonInput): string => {
  const packageManager = findPackageManager(selected)
  const managerFields =
    packageManager === undefined
      ? undefined
      : packageManagerFields({ ...packageManager, allowedBuilds: values.allowedBuilds, catalog })
  const packageJson = {
    name: projectName,
    ...values.fields,
    packageManager: managerFields?.packageManager,
    scripts: values.scripts,
    dependencies: values.dependencies,
    devDependencies: values.devDependencies,
    ...managerFields?.fields,
  }
  return `${JSON.stringify(packageJson, null, 2)}\n`
}

const assertScript = (
  scripts: Readonly<Record<string, string>>,
  script: string,
  detail: string,
) => {
  if (!Object.hasOwn(scripts, script)) {
    throw new ComposeError(`${detail} "${script}", but no plugin defines it`)
  }
}

const collectPostSteps = (
  plugins: readonly LoadedPlugin[],
  answers: Answers,
  scripts: Readonly<Record<string, string>>,
): PostStepScript[] =>
  plugins.flatMap(({ manifest }) =>
    (manifest.postSteps ?? [])
      .filter((step) => step.when === undefined || evaluateCondition(step.when, answers))
      .map((step) => {
        assertScript(scripts, step.script, `${manifest.name} runs the script after the install:`)
        return {
          script: step.script,
          running: step.running ?? `Running ${step.script}`,
          done: step.done ?? `Ran ${step.script}`,
        }
      }),
  )

/** The stack in plugin order, and the next steps with those of the base project, such as `dev`, last. */
const uniqueSteps = (steps: NextStep[]): NextStep[] => {
  const seen = new Set<string>()
  return steps.filter((step) => {
    const key = JSON.stringify(step)
    const isNew = !seen.has(key)
    seen.add(key)
    return isNew
  })
}

const collectSummary = (
  plugins: readonly LoadedPlugin[],
  answers: Answers,
  scripts: Readonly<Record<string, string>>,
): ProjectPlan['summary'] => ({
  stack: [...new Set(plugins.flatMap(({ manifest }) => manifest.contributes?.stack ?? []))],
  nextSteps: uniqueSteps(
    [...plugins.slice(1), ...plugins.slice(0, 1)].flatMap(({ manifest }) =>
      (manifest.contributes?.nextSteps ?? [])
        .filter((step) => step.when === undefined || evaluateCondition(step.when, answers))
        .map((step): NextStep => {
          if ('command' in step) {
            return { command: step.command }
          }
          assertScript(scripts, step.script, `${manifest.name} suggests the script`)
          return { script: step.script }
        }),
    ),
  ),
})

const addCoreFile = (files: VirtualFiles, path: string, content: string): void =>
  addFile(files, { path, content, origin: CORE_ORIGIN, conflict: 'error', replaceable: new Set() })

const projectValues = ({ projectName, answers, selected }: ComposeInput): ProjectValues => {
  const alias = answers.settings[IMPORT_ALIAS_SETTING]
  const importAlias = typeof alias === 'string' ? alias : DEFAULT_IMPORT_ALIAS
  if (!IMPORT_ALIAS.test(importAlias)) {
    throw new ComposeError(
      `the import alias "${importAlias}" is invalid; use a pattern such as "@/*" or "~/*"`,
    )
  }
  const packageManager = findPackageManager(selected)?.name ?? FALLBACK_PACKAGE_MANAGER
  const sourceRoot = answers.settings[SRC_DIR_SETTING] === true ? `./${SOURCE_DIRECTORY}/` : './'
  return {
    name: projectName,
    importAlias,
    importAliasTarget: `${sourceRoot}*`,
    packageManager,
    run: `${packageManager} run`,
  }
}

/**
 * Composes the project in memory: merges the contributions of the base project and the selected
 * plugins, renders their files, and adds package.json and next-suite.json. Nothing is written.
 */
export const composeProject = async (input: ComposeInput): Promise<ProjectPlan> => {
  const plugins = [input.base, ...input.selected]
  const values = mergeContributions(
    [
      input.base.manifest,
      settingContributions(input.answers.settings),
      ...input.selected.map((plugin) => plugin.manifest),
    ],
    input.catalog,
  )
  const context: RenderContext = {
    project: projectValues(input),
    answers: input.answers,
    values,
    facts: collectFacts([input.base, ...input.available], input.answers),
  }
  const files: VirtualFiles = new Map()
  await addPluginFiles(files, plugins, context)
  addCoreFile(
    files,
    PACKAGE_FILE,
    createPackageJson({
      projectName: input.projectName,
      values,
      selected: input.selected,
      catalog: input.catalog,
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
    packageManager: findPackageManager(input.selected)?.name,
    postSteps: collectPostSteps(plugins, input.answers, values.scripts),
    summary: collectSummary(plugins, input.answers, values.scripts),
  }
}
