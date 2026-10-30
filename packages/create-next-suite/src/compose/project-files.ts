import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import type { Answers } from '../answers/answers.ts'
import { holdsFor } from '../answers/evaluate-condition.ts'
import { optionsOf } from '../answers/plugin-options.ts'
import { isTemplateSource } from '../contract/plugin-file.ts'
import type { ParsedPluginManifest } from '../contract/plugin-manifest.ts'
import type { LoadedPlugin } from '../loader/load-plugin.ts'
import { assertSafeTarget } from './assert-safe-target.ts'
import { ComposeError } from './compose-error.ts'
import { askFact, type Facts } from './facts.ts'
import { instrumentationClientFile, instrumentationFile } from './instrumentation-files.ts'
import type { CompositionValues } from './merge-contributions.ts'
import type { ProjectValues } from './project-values.ts'
import { SOURCE_DIRECTORY, usesSourceDirectory } from './project-values.ts'
import type { LogicFile } from './run-logic.ts'
import {
  BASE_TEMPLATE_BLOCKS,
  type BlockHelper,
  PLUGIN_TEMPLATE_BLOCKS,
} from './template/block-helpers.ts'
import { renderTemplate } from './template/render-template.ts'
import { type TemplateValues, templateContext } from './template-values.ts'
import { addFile, type VirtualFiles } from './virtual-files.ts'

const CORE_ORIGIN = 'create-next-suite'
const INSTRUMENTATION_FILE = 'instrumentation.ts'
const INSTRUMENTATION_CLIENT_FILE = 'instrumentation-client.ts'

type PluginFile = NonNullable<ParsedPluginManifest['files']>[number]

export type RenderContext = {
  project: ProjectValues
  answers: Answers
  values: TemplateValues
  facts: Facts
}

type FileToRender = {
  plugin: LoadedPlugin
  file: PluginFile
  context: RenderContext
  allowedBlocks: readonly BlockHelper[]
}

const requiredPlugins = (manifest: ParsedPluginManifest): ReadonlySet<string> =>
  new Set(
    (manifest.requires ?? []).flatMap((rule) => ('plugin' in rule.when ? [rule.when.plugin] : [])),
  )

/** The path of a file in the project: under `src/` for a source file when the project uses one. */
const targetPath = (file: Pick<PluginFile, 'root' | 'target'>, answers: Answers): string =>
  file.root === 'source' && usesSourceDirectory(answers)
    ? `${SOURCE_DIRECTORY}/${file.target}`
    : file.target

const readPluginFile = async ({
  plugin,
  file,
  context,
  allowedBlocks,
}: FileToRender): Promise<string> => {
  const source = await readFile(join(plugin.directory, file.source), 'utf8')
  if (!isTemplateSource(file.source)) {
    return source
  }
  const values = templateContext(context.values, {
    project: context.project,
    settings: context.answers.settings,
    options: optionsOf(plugin.manifest.name, context.answers),
  })
  try {
    return renderTemplate({
      source,
      values,
      has: (fact) => askFact(context.facts, fact, 'the template'),
      allowedBlocks,
    })
  } catch (error) {
    throw new ComposeError(`${plugin.manifest.name}: ${file.source} does not render`, {
      cause: error,
    })
  }
}

/**
 * Adds the files of the base project and the plugins whose condition holds, the replacing ones
 * last, so they find the file they replace.
 */
export const addPluginFiles = async (
  files: VirtualFiles,
  plugins: readonly LoadedPlugin[],
  context: RenderContext,
): Promise<void> => {
  const [base] = plugins
  const contributions = plugins.flatMap((plugin) =>
    (plugin.manifest.files ?? [])
      .filter((file) => holdsFor(file.when, context.answers))
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

type LogicFilesInput = {
  logicFiles: readonly LogicFile[]
  plugins: readonly LoadedPlugin[]
  answers: Answers
}

export const addLogicFiles = (
  files: VirtualFiles,
  { logicFiles, plugins, answers }: LogicFilesInput,
): void => {
  const manifestOf = new Map(plugins.map((plugin) => [plugin.manifest.name, plugin.manifest]))
  for (const file of logicFiles) {
    const path = targetPath(file, answers)
    const manifest = manifestOf.get(file.origin)
    assertSafeTarget(path, file.origin)
    addFile(files, {
      path,
      content: file.content,
      origin: file.origin,
      conflict: file.conflict,
      replaceable: manifest === undefined ? new Set() : requiredPlugins(manifest),
    })
  }
}

/** Adds a file the core writes itself; any plugin writing the same path fails. */
export const addCoreFile = (files: VirtualFiles, path: string, content: string): void =>
  addFile(files, { path, content, origin: CORE_ORIGIN, conflict: 'error', replaceable: new Set() })

/** Adds instrumentation.ts and instrumentation-client.ts once a plugin contributes to them. */
export const addInstrumentationFiles = (
  files: VirtualFiles,
  values: CompositionValues,
  answers: Answers,
): void => {
  const instrumentation = instrumentationFile(values.instrumentation)
  if (instrumentation !== undefined) {
    const path = targetPath({ target: INSTRUMENTATION_FILE, root: 'source' }, answers)
    addCoreFile(files, path, instrumentation)
  }
  const instrumentationClient = instrumentationClientFile(values.instrumentationClient)
  if (instrumentationClient !== undefined) {
    const path = targetPath({ target: INSTRUMENTATION_CLIENT_FILE, root: 'source' }, answers)
    addCoreFile(files, path, instrumentationClient)
  }
}
