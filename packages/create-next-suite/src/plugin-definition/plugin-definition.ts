import type { JsxAttributeValue } from '../code-edit/jsx-attribute.ts'
import type { ModuleImport } from '../code-edit/module-import.ts'
import type { ChildrenWrapper } from '../code-edit/order-wrappers.ts'
import type { TypescriptModule } from '../code-edit/typescript-module.ts'
import type { EnvVariable } from '../project-model/environment.ts'
import type { ModuleExport, NamedModuleExport } from '../project-model/instrumentation.ts'
import type { PackageManagerUse } from '../project-model/package-json.ts'
import type { CollectorPointName, CollectorPoints } from './collector-point.ts'
import type {
  CoreContext,
  FinishContext,
  FinishHelpers,
  PluginContext,
  ReservedKeys,
  UsesShape,
} from './plugin-context.ts'
import type { Answer, PluginOption } from './plugin-option.ts'
import type { PluginProject } from './plugin-project.ts'
import type { ValuePointName, ValuePoints } from './value-point.ts'

/**
 * A field written as its value or as a function of the plugin's context.
 *
 * @typeParam Value - The field's value.
 * @typeParam Context - What the function gets.
 */
type ValueOrFunction<Value, Context> = Value | ((context: Context) => Value)

/**
 * An edit of a TypeScript file, run once every plugin has contributed.
 *
 * @typeParam Context - What the edit gets besides the module.
 */
export type FileEdit<Context> = (module: TypescriptModule, context: Context) => void

/**
 * A file of the plugin's directory: its path there, copied as it is, or with an `edit` of the
 * copy.
 *
 * @typeParam Context - What the edit gets.
 */
export type FileEntry<Context> =
  | string
  | { readonly source: string; readonly edit?: FileEdit<Context> }

/** An environment variable under its name; `.env.example` lists it in the plugin's group. */
export type EnvEntry = Omit<EnvVariable, 'name'>

/** What a plugin adds to the root layout `app/layout.tsx`. */
export type LayoutContribution = {
  readonly imports?: readonly ModuleImport[]
  /**
   * `{children}` becomes `<Component …props>{children}</Component>`; a later plugin's wrapper
   * goes inside, unless `inside` names the component to go inside of.
   */
  readonly wrapChildren?: ChildrenWrapper
  /** Elements added as the last children of `<body>`, such as `<Analytics />`. */
  readonly appendToBody?: readonly string[]
  /** Attributes of `<html>`: a string value, or `true` for a bare attribute. */
  readonly htmlAttributes?: Readonly<Record<string, JsxAttributeValue>>
  /** Properties of the exported `metadata`, each code: `{ robots: '{ index: true }' }`. */
  readonly metadata?: Readonly<Record<string, string>>
}

/** What a plugin adds to `next.config.ts`. */
export type NextConfigContribution = {
  readonly imports?: readonly ModuleImport[]
  /** Options of the exported config object, each code: `{ headers: 'async () => […]' }`. */
  readonly options?: Readonly<Record<string, string>>
  /** Calls that wrap the exported config, the last one outermost: `['withMDX']`. */
  readonly wrap?: readonly string[]
}

/** The modules the instrumentation hooks load. */
export type InstrumentationContribution = {
  /** Modules `register()` in `instrumentation.ts` loads, and the export it calls. */
  readonly register?: readonly ModuleExport[]
  /** Exports `onRequestError` in `instrumentation.ts` calls with the error. */
  readonly onRequestError?: readonly NamedModuleExport[]
  /** Modules `instrumentation-client.ts` imports, and the export it calls. */
  readonly client?: readonly ModuleExport[]
}

/**
 * The package manager a project runs with, stated by a plugin of the `package-manager` category;
 * the plugin's name is the command.
 */
export type PackageManagerSection = Omit<PackageManagerUse, 'name'> & {
  /**
   * The arguments of the first install, such as `['install', '--no-immutable']` for Yarn, which
   * refuses to create a lockfile in CI otherwise; `['install']` by default.
   */
  readonly installArgs?: readonly string[]
  /** The arguments of a CI install that keeps the lockfile as it is, such as `['ci']` for npm. */
  readonly ciInstallArgs: readonly string[]
}

/** How the provider of a collector point creates the collector and finishes it into files. */
type CollectorProvision<Collector, Finish> = {
  /** Creates what the users of the point contribute to. */
  readonly create: () => Collector
  /** Reads what the users contributed, after every `extend`, and writes it into files. */
  readonly finish: (collected: Collector, context: Finish) => void
}

/**
 * The values a plugin states for value points. A value is written as it is or as a function of
 * the context; a value that is itself a function cannot be stated.
 */
type Provisions<Context> = {
  readonly [Name in ValuePointName]?: ValueOrFunction<ValuePoints[Name], Context>
}

/** The collector points a plugin provides. */
type Collections<Finish> = {
  readonly [Name in CollectorPointName]?: CollectorProvision<CollectorPoints[Name], Finish>
}

/** Contributions to collector points; one without a selected provider is dropped. */
type Extensions<Context> = {
  readonly [Name in CollectorPointName]?: (
    collector: CollectorPoints[Name],
    context: Context,
  ) => void
}

/** The fields every plugin has, whatever its points. */
type PluginFields<Uses, Options, Context, Finish> = {
  /** The plugin's name, such as `better-auth`; also its flag. */
  readonly name: string
  /** The name the wizard shows. */
  readonly title: string
  /** What the plugin adds, in one sentence. */
  readonly description?: string
  /** The category the plugin answers; without one it is an extra, which runs last. */
  readonly category?: string
  /** The section of the wizard that asks an extra. */
  readonly section?: string
  /** The plugin that does not run when this one is selected; this one takes over its points. */
  readonly replaces?: string
  /** Plugins that cannot be selected together with this one, each with the reason. */
  readonly conflicts?: Readonly<Record<string, string>>
  /** The points the plugin reads, by the name its functions get them under. */
  readonly uses?: Uses
  /** Further questions, by option name. */
  readonly options?: Options
  /** The package manager the project runs with; only for a plugin of the `package-manager` category. */
  readonly packageManager?: PackageManagerSection
  readonly dependencies?: ValueOrFunction<Readonly<Record<string, string>>, Context>
  readonly devDependencies?: ValueOrFunction<Readonly<Record<string, string>>, Context>
  readonly scripts?: ValueOrFunction<Readonly<Record<string, string>>, Context>
  /** Environment variables by name. */
  readonly env?: ValueOrFunction<Readonly<Record<string, EnvEntry>>, Context>
  /** Files of the plugin's directory by the project path they are copied to, such as `@/lib/auth.ts`. */
  readonly files?: ValueOrFunction<Readonly<Record<string, FileEntry<Finish>>>, Context>
  readonly layout?: ValueOrFunction<LayoutContribution, Context>
  readonly nextConfig?: ValueOrFunction<NextConfigContribution, Context>
  /** Stylesheets the global stylesheet imports first, such as `tailwindcss`. */
  readonly css?: ValueOrFunction<{ readonly imports: readonly string[] }, Context>
  /** Lines `.gitignore` gets. */
  readonly gitignore?: ValueOrFunction<readonly string[], Context>
  /** README sections by title. */
  readonly readme?: ValueOrFunction<Readonly<Record<string, string>>, Context>
  readonly instrumentation?: ValueOrFunction<InstrumentationContribution, Context>
  /**
   * Edits of files other plugins or the base write, by project path. They are recorded as direct
   * edits and break when those files change.
   */
  readonly edit?: Readonly<Record<string, FileEdit<Finish>>>
  /** Free code for what no field covers; it runs after the plugin's other fields. */
  readonly setup?: (project: PluginProject, context: Context) => void
}

/**
 * What `definePlugin` takes, typed by the points the plugin uses and its options.
 *
 * @typeParam Uses - The points the plugin uses, by the name its functions read them under.
 * @typeParam Options - The plugin's options as written.
 */
export type PluginDefinition<Uses extends UsesShape, Options> = PluginFields<
  Uses & ReservedKeys,
  Options,
  PluginContext<Uses, Options>,
  FinishContext<Uses, Options>
> & {
  /** The values the plugin states for value points. */
  readonly provides?: Provisions<PluginContext<Uses, Options>>
  /** The collector points the plugin provides. */
  readonly collects?: Collections<FinishContext<Uses, Options>>
  /** Contributions to collector points of other plugins, by point name. */
  readonly extend?: Extensions<PluginContext<Uses, Options>>
}

/** The context of a plugin as the core builds it, without the types `definePlugin` checks. */
export type AnyContext = CoreContext<Readonly<Record<string, Answer>>> &
  Readonly<Record<string, unknown>>

export type AnyFinishContext = AnyContext & FinishHelpers

/** A plugin as the core runs it, with the types of its context erased. */
export type Plugin = PluginFields<
  UsesShape,
  Readonly<Record<string, PluginOption>>,
  AnyContext,
  AnyFinishContext
> & {
  readonly provides?: Readonly<Record<string, unknown>>
  readonly collects?: Readonly<Record<string, CollectorProvision<unknown, AnyFinishContext>>>
  readonly extend?: Readonly<Record<string, (collector: unknown, context: AnyContext) => void>>
}
