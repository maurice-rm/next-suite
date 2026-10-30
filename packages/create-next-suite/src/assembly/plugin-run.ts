import type { ChildrenWrapper } from '../code-edit/order-wrappers.ts'
import type { TypescriptModule } from '../code-edit/typescript-module.ts'
import { ExpectedError } from '../expected-error.ts'
import type { NextStep } from '../plugin-definition/next-step.ts'
import type { ProjectPackageManager } from '../plugin-definition/plugin-context.ts'
import type {
  AnyContext,
  AnyFinishContext,
  EnvEntry,
  FileEdit,
  FileEntry,
  InstrumentationContribution,
  LayoutContribution,
  NextConfigContribution,
} from '../plugin-definition/plugin-definition.ts'
import type { PluginProject } from '../plugin-definition/plugin-project.ts'
import type { PostStep } from '../plugin-definition/post-step.ts'
import { pointOf } from '../plugin-definition/used-point.ts'
import { PROJECT_FILES, type Project } from '../project-model/project.ts'
import type { OperationKind } from '../project-model/provenance.ts'
import { AssemblyError } from './assembly-error.ts'
import type { LoadedPlugin } from './loaded-plugin.ts'
import { type PluginAnswers, resolveAnswers } from './resolve-answers.ts'
import type { PluginRunSteps } from './run-steps.ts'

/** The points of one assembly: who provides each, the values stated and the collectors created. */
export type PointState = {
  providers: ReadonlyMap<string, string>
  values: Map<string, unknown>
  collectors: Map<string, unknown>
}

type RunInput = {
  project: Project
  points: PointState
  /** The names of the plugins that run, for `has`. */
  running: ReadonlySet<string>
  answers: PluginAnswers | undefined
  /** The directories of generated code on disk, which every plugin adds to while it collects. */
  generatedDirectories: string[]
  projectName: string
  packageManager: ProjectPackageManager
}

/** One plugin's way through the phases of an assembly, each run once in plugin order. */
export type PluginRun = {
  /** Phase 1: the values and collectors the plugin provides, its fields and its `setup`. */
  collect: () => void
  /** The plugin's `layout.wrapChildren`, applied once every plugin has collected. */
  layoutWrapper: () => ChildrenWrapper | undefined
  /** Phase 2: contributions to collector points whose provider is selected. */
  extend: () => void
  /** Phase 3: the edits of the files the plugin copied. */
  editOwnFiles: () => void
  /** Phase 4: each collector point the plugin provides, finished into files. */
  finishCollectors: () => void
  /** Phase 5: direct edits of files others write. */
  editOtherFiles: () => void
  /** The plugin's stack, next steps and post-steps, read while it collects. */
  runSteps: () => PluginRunSteps
}

/** A field's value: the value itself, or what its function returns for the context. */
const resolveField = <Value>(field: unknown, context: AnyContext): Value | undefined =>
  typeof field === 'function'
    ? (field as (context: AnyContext) => Value)(context)
    : (field as Value | undefined)

/** The entries of a record the erased plugin type cannot narrow. */
const entriesOf = <Value>(record: object | undefined): [string, Value][] =>
  Object.entries(record ?? {}) as [string, Value][]

/** Runs a step of a plugin; an error the user can act on gets the plugin and step in front. */
const inStep = <Result>(plugin: string, step: string, run: () => Result): Result => {
  try {
    return run()
  } catch (error) {
    if (error instanceof ExpectedError) {
      throw new AssemblyError(`${plugin} (${step}): ${error.message}`, {
        cause: error,
      })
    }
    throw error
  }
}

export const createPluginRun = (
  { plugin, readFile }: LoadedPlugin,
  {
    project,
    points,
    running,
    answers,
    generatedDirectories,
    projectName,
    packageManager,
  }: RunInput,
): PluginRun => {
  const { name } = plugin
  const ownEdits: [string, FileEdit<AnyFinishContext>][] = []
  let context: AnyContext | undefined
  let wrapper: ChildrenWrapper | undefined
  let runSteps: PluginRunSteps = { plugin: name, stack: [], nextSteps: [], postSteps: [] }

  const record = (path: string, operation: string, kind: OperationKind): void => {
    project.provenance.record({
      path: project.diskPath(path),
      plugin: name,
      operation,
      kind,
    })
  }

  /** `own` for a file the plugin wrote, `direct` for anyone else's. */
  const kindOf = (path: string): OperationKind =>
    project.ownerOf(path) === name ? 'own' : 'direct'

  /** What a used point gives: its value, `true` for a collector, `undefined` without provider. */
  const usedValueOf = (point: string): unknown => {
    if (!points.providers.has(point)) {
      return undefined
    }
    return points.values.has(point) ? points.values.get(point) : true
  }

  const createContext = (): AnyContext => {
    const usedValues = entriesOf<Parameters<typeof pointOf>[0]>(plugin.uses).map(([key, used]) => {
      const point = pointOf(used).name
      project.provenance.recordUse(point, name)
      return [key, usedValueOf(point)]
    })
    return {
      ...Object.fromEntries(usedValues),
      options: resolveAnswers(plugin, answers),
      projectName,
      packageManager,
      has: (pluginName: string) => running.has(pluginName),
      diskPath: (path: string) => project.diskPath(path),
      readFile,
      versionOf: (dependency: string) => project.packageJson().versionOf(dependency),
    }
  }

  const contextOf = (): AnyContext => {
    context ??= createContext()
    return context
  }

  /** A field's value; an error its function throws names the plugin and the field. */
  const fieldValue = <Value>(label: string, field: unknown): Value | undefined =>
    inStep(name, label, () => resolveField<Value>(field, contextOf()))

  const finishContext = (step: string): AnyFinishContext => ({
    ...contextOf(),
    env: project.environment.variables(),
    generatedDirectories,
    scripts: project.packageJson().scripts(),
    module: (path: string): TypescriptModule => {
      record(path, `${step}: module`, kindOf(path))
      return project.module(path)
    },
    write: (path: string, content: string) => {
      project.write(path, content, name)
      record(path, `${step}: write`, 'own')
    },
    packageJson: {
      setField: (field, value) => {
        project.packageJson().setField(field, value, name)
        record(PROJECT_FILES.packageJson, `${step}: field ${field}`, 'extend')
      },
    },
  })

  /** Applies each entry of a record field and records it as `<field> <key>` on `path`. */
  const applyEntries = <Value>(
    field: { label: string; value: unknown; path: string },
    apply: (key: string, value: Value) => void,
  ): void => {
    for (const [key, value] of entriesOf<Value>(fieldValue<object>(field.label, field.value))) {
      inStep(name, `${field.label} ${key}`, () => apply(key, value))
      record(field.path, `${field.label} ${key}`, 'extend')
    }
  }

  const applyPackageFields = (): void => {
    const path = PROJECT_FILES.packageJson
    applyEntries<string>(
      { label: 'dependencies', value: plugin.dependencies, path },
      (key, value) => project.packageJson().addDependency(key, value, name),
    )
    applyEntries<string>(
      { label: 'devDependencies', value: plugin.devDependencies, path },
      (key, value) => project.packageJson().addDevDependency(key, value, name),
    )
    applyEntries<string>({ label: 'scripts', value: plugin.scripts, path }, (key, value) =>
      project.packageJson().setScript(key, value, name),
    )
  }

  const applyPackageManager = (): void => {
    const section = plugin.packageManager
    if (section === undefined) {
      return
    }
    inStep(name, 'packageManager', () => {
      project.packageJson().usePackageManager({ ...section, name })
      project.readme().setRunCommand(packageManager.run)
    })
    record(PROJECT_FILES.packageJson, `packageManager ${name}`, 'extend')
    record(PROJECT_FILES.readme, `packageManager ${name}`, 'extend')
  }

  const applyTextFields = (): void => {
    applyEntries<EnvEntry>(
      { label: 'env', value: plugin.env, path: PROJECT_FILES.envExample },
      (key, entry) =>
        project.environment.add({ ...entry, name: key }, { title: plugin.title, origin: name }),
    )
    applyEntries<string>(
      { label: 'readme', value: plugin.readme, path: PROJECT_FILES.readme },
      (title, text) => project.readme().addSection(title, text, name),
    )
    for (const line of fieldValue<readonly string[]>('gitignore', plugin.gitignore) ?? []) {
      project.gitignore().add(line)
      record(PROJECT_FILES.gitignore, `gitignore ${line}`, 'extend')
    }
    const generated = fieldValue<readonly string[]>(
      'generatedDirectories',
      plugin.generatedDirectories,
    )
    for (const directory of generated ?? []) {
      const disk = project.diskPath(directory)
      if (!generatedDirectories.includes(disk)) {
        generatedDirectories.push(disk)
      }
      record(PROJECT_FILES.gitignore, `generatedDirectories ${directory}`, 'extend')
    }
    const css = fieldValue<{ imports: readonly string[] }>('css', plugin.css)
    for (const specifier of css?.imports ?? []) {
      inStep(name, `css.imports ${specifier}`, () => project.stylesheet().addImport(specifier))
      record(PROJECT_FILES.stylesheet, `css.imports ${specifier}`, 'extend')
    }
  }

  const applyInstrumentation = (): void => {
    const field = fieldValue<InstrumentationContribution>('instrumentation', plugin.instrumentation)
    const { instrumentation } = project
    for (const entry of field?.register ?? []) {
      instrumentation.register(entry)
      record(PROJECT_FILES.instrumentation, `instrumentation.register ${entry.module}`, 'extend')
    }
    for (const entry of field?.onRequestError ?? []) {
      instrumentation.onRequestError(entry)
      record(
        PROJECT_FILES.instrumentation,
        `instrumentation.onRequestError ${entry.module}`,
        'extend',
      )
    }
    for (const entry of field?.client ?? []) {
      instrumentation.addClient(entry)
      record(
        PROJECT_FILES.instrumentationClient,
        `instrumentation.client ${entry.module}`,
        'extend',
      )
    }
  }

  const copyFiles = (): void => {
    const files = fieldValue<object>('files', plugin.files)
    for (const [target, entry] of entriesOf<FileEntry<AnyFinishContext>>(files)) {
      const fileSource = typeof entry === 'string' ? entry : entry.source
      inStep(name, `copy ${fileSource}`, () => project.write(target, readFile(fileSource), name))
      record(target, `copy ${fileSource}`, 'own')
      if (typeof entry !== 'string' && entry.edit !== undefined) {
        ownEdits.push([target, entry.edit])
      }
    }
  }

  const applyLayout = (): void => {
    const field = fieldValue<LayoutContribution>('layout', plugin.layout)
    if (field === undefined) {
      return
    }
    const path = PROJECT_FILES.layout
    const apply = (operation: string, change: () => void): void => {
      inStep(name, operation, change)
      record(path, operation, 'extend')
    }
    for (const moduleImport of field.imports ?? []) {
      apply(`layout.imports ${moduleImport.from}`, () => project.layout().addImport(moduleImport))
    }
    for (const [key, code] of Object.entries(field.metadata ?? {})) {
      apply(`layout.metadata ${key}`, () => project.layout().metadata().set(key, code))
    }
    for (const element of field.appendToBody ?? []) {
      apply(`layout.appendToBody ${element}`, () => project.layout().appendToBody(element))
    }
    for (const [attribute, value] of Object.entries(field.htmlAttributes ?? {})) {
      apply(`layout.htmlAttributes ${attribute}`, () =>
        project.layout().setHtmlAttribute(attribute, value),
      )
    }
    wrapper = field.wrapChildren
  }

  const applyNextConfig = (): void => {
    const field = fieldValue<NextConfigContribution>('nextConfig', plugin.nextConfig)
    if (field === undefined) {
      return
    }
    const apply = (operation: string, change: () => void): void => {
      inStep(name, operation, change)
      record(PROJECT_FILES.nextConfig, operation, 'extend')
    }
    for (const moduleImport of field.imports ?? []) {
      apply(`nextConfig.imports ${moduleImport.from}`, () =>
        project.nextConfig().addImport(moduleImport),
      )
    }
    for (const [key, code] of Object.entries(field.options ?? {})) {
      apply(`nextConfig.options ${key}`, () => project.nextConfig().setOption(key, code))
    }
    for (const call of field.wrap ?? []) {
      apply(`nextConfig.wrap ${call}`, () => project.nextConfig().wrap(call))
    }
  }

  const setupProject = (): PluginProject => ({
    packageJson: {
      setField: (field, value) => {
        project.packageJson().setField(field, value, name)
        record(PROJECT_FILES.packageJson, `setup: field ${field}`, 'extend')
      },
    },
    tsconfig: {
      addPath: (alias, targets) => {
        project.tsconfig().addPath(alias, targets, name)
        record(PROJECT_FILES.tsconfig, `setup: path ${alias}`, 'extend')
      },
      addInclude: (pattern) => {
        project.tsconfig().addInclude(pattern)
        record(PROJECT_FILES.tsconfig, `setup: include ${pattern}`, 'extend')
      },
    },
    module: (path) => {
      record(path, 'setup: module', kindOf(path))
      return project.module(path)
    },
    write: (path, content) => {
      project.write(path, content, name)
      record(path, 'setup: write', 'own')
    },
  })

  const readRunSteps = (): void => {
    runSteps = {
      plugin: name,
      stack: fieldValue<readonly string[]>('stack', plugin.stack) ?? [],
      nextSteps: fieldValue<readonly NextStep[]>('nextSteps', plugin.nextSteps) ?? [],
      postSteps: fieldValue<readonly PostStep[]>('postSteps', plugin.postSteps) ?? [],
    }
  }

  const provide = (): void => {
    for (const [point, value] of entriesOf<unknown>(plugin.provides)) {
      points.values.set(
        point,
        inStep(name, `provides ${point}`, () => resolveField(value, contextOf())),
      )
    }
    for (const [point, provision] of entriesOf<{ create: () => unknown }>(plugin.collects)) {
      points.collectors.set(point, inStep(name, `collects ${point}`, provision.create))
    }
  }

  return {
    collect: () => {
      contextOf()
      provide()
      applyPackageManager()
      applyPackageFields()
      applyTextFields()
      applyInstrumentation()
      copyFiles()
      applyLayout()
      applyNextConfig()
      readRunSteps()
      const { setup } = plugin
      if (setup !== undefined) {
        inStep(name, 'setup', () => setup(setupProject(), contextOf()))
      }
    },

    layoutWrapper: () => wrapper,

    runSteps: () => runSteps,

    extend: () => {
      for (const [point, contribute] of entriesOf<
        (collector: unknown, context: AnyContext) => void
      >(plugin.extend)) {
        if (points.collectors.has(point)) {
          project.provenance.recordContribution(point, name)
          inStep(name, `extend ${point}`, () =>
            contribute(points.collectors.get(point), contextOf()),
          )
        }
      }
    },

    editOwnFiles: () => {
      for (const [path, edit] of ownEdits) {
        record(path, 'edit', 'own')
        inStep(name, `edit of ${path}`, () =>
          edit(project.module(path), finishContext(`edit of ${path}`)),
        )
      }
    },

    finishCollectors: () => {
      for (const [point, provision] of entriesOf<{
        finish: (collected: unknown, context: AnyFinishContext) => void
      }>(plugin.collects)) {
        inStep(name, `finish ${point}`, () =>
          provision.finish(points.collectors.get(point), finishContext(`finish ${point}`)),
        )
      }
    },

    editOtherFiles: () => {
      for (const [path, edit] of entriesOf<FileEdit<AnyFinishContext>>(plugin.edit)) {
        inStep(name, `edit of ${path}`, () => {
          const module = project.module(path)
          const owner = project.ownerOf(path)
          record(path, `edit (a file of ${owner})`, kindOf(path))
          edit(module, finishContext(`edit of ${path}`))
        })
      }
    },
  }
}
