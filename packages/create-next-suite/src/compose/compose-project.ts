import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import type { Answers, AnswerValue } from '../answers/answers.ts'
import { evaluateCondition } from '../answers/evaluate-condition.ts'
import type { ParsedPluginManifest } from '../contract/plugin-manifest.ts'
import type { LoadedPlugin } from '../loader/load-plugin.ts'
import {
  BASE_TEMPLATE_BLOCKS,
  type BlockHelper,
  PLUGIN_TEMPLATE_BLOCKS,
} from '../template/check-template.ts'
import { collectFacts } from '../template/collect-facts.ts'
import { type Facts, renderTemplate } from '../template/render-template.ts'
import { assertNoPathCollisions } from './assert-no-path-collisions.ts'
import { assertSafeTarget } from './assert-safe-target.ts'
import { compareNames } from './compare-names.ts'
import { ComposeError } from './compose-error.ts'
import {
  type CompositionValues,
  mergeContributions,
  type VersionCatalog,
} from './merge-contributions.ts'
import { createProjectManifest, PROJECT_MANIFEST_FILE } from './project-manifest.ts'
import { addFile, type VirtualFile, type VirtualFiles } from './virtual-files.ts'

const CORE_ORIGIN = 'create-next-suite'
const SOURCE_DIRECTORY = 'src'
const SRC_DIR_SETTING = 'src-dir'
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
}

type PluginFile = NonNullable<ParsedPluginManifest['files']>[number]

type RenderContext = {
  projectName: string
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

const renderFile = async ({
  plugin,
  file,
  context,
  allowedBlocks,
}: FileToRender): Promise<string> => {
  const source = await readFile(join(plugin.folder, file.source), 'utf8')
  const values = {
    project: { name: context.projectName },
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
      content: await renderFile({
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

const createPackageJson = (projectName: string, values: CompositionValues): string => {
  const packageJson = {
    name: projectName,
    ...values.fields,
    scripts: values.scripts,
    dependencies: values.dependencies,
    devDependencies: values.devDependencies,
  }
  return `${JSON.stringify(packageJson, null, 2)}\n`
}

const addCoreFile = (files: VirtualFiles, path: string, content: string): void =>
  addFile(files, { path, content, origin: CORE_ORIGIN, conflict: 'error', replaceable: new Set() })

/**
 * Composes the project in memory: merges the contributions of the base project and the selected
 * plugins, renders their files, and adds package.json and next-suite.json. Nothing is written.
 */
export const composeProject = async (input: ComposeInput): Promise<ProjectPlan> => {
  const plugins = [input.base, ...input.selected]
  const values = mergeContributions(
    plugins.map((plugin) => plugin.manifest),
    input.catalog,
  )
  const context: RenderContext = {
    projectName: input.projectName,
    answers: input.answers,
    values,
    facts: collectFacts([input.base, ...input.available], input.answers),
  }
  const files: VirtualFiles = new Map()
  await addPluginFiles(files, plugins, context)
  addCoreFile(files, PACKAGE_FILE, createPackageJson(input.projectName, values))
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
  }
}
