import type { TypescriptModule } from '../code-edit/typescript-module.ts'
import type { EnvVariable } from '../project-model/environment.ts'
import type { JsonValue } from '../project-model/json-value.ts'
import type { Answers } from './plugin-option.ts'
import type { UsedPoint, UsedValue } from './used-point.ts'

/** The points a plugin uses, by the name its functions read them under. */
export type UsesShape = Readonly<Record<string, UsedPoint>>

/** What every function of a plugin gets besides the values of the points it uses. */
export type CoreContext<OptionAnswers> = {
  /** The answers to the plugin's options. */
  options: OptionAnswers
  /**
   * Whether a plugin of that name runs; `false` for a plugin another one replaces. Branch on the
   * values of points instead where a point exists.
   */
  has: (pluginName: string) => boolean
  /** Where a project path such as `@/db/schema` lies on disk, for config files that name paths. */
  diskPath: (path: string) => string
  /** The text of a file of the plugin's directory, such as code handed to a collector. */
  readFile: (source: string) => string
  /**
   * The version a dependency of the project is pinned to, such as `next`'s.
   *
   * @throws ProjectError when the project has no such dependency.
   */
  versionOf: (dependency: string) => string
}

/** What edits and `finish` get on top, once every plugin has contributed. */
export type FinishHelpers = {
  /** Every environment variable of the project, from all plugins. */
  env: readonly EnvVariable[]
  /**
   * Every directory of generated code, from all plugins, as a path on disk such as
   * `src/generated`, for the tools that skip it.
   */
  generatedDirectories: readonly string[]
  /** The module of a TypeScript file of the project, also one another plugin wrote. */
  module: (path: string) => TypescriptModule
  /** Adds a file the plugin owns, such as one built from what a collector point collected. */
  write: (path: string, content: string) => void
  packageJson: {
    /** Sets a top-level field of `package.json`, such as the allowed builds of a package manager. */
    setField: (name: string, value: JsonValue) => void
  }
}

/**
 * The context of a plugin's functions while the plugins contribute: the value of each used point
 * under its name, the answers and the helpers.
 *
 * @typeParam Uses - The points the plugin uses.
 * @typeParam Options - The plugin's options.
 */
export type PluginContext<Uses extends UsesShape, Options> = {
  readonly [Key in keyof Uses]: UsedValue<Uses[Key]>
} & CoreContext<Answers<Options>>

/**
 * The context of file edits and of `finish`, which run once every plugin has contributed: the
 * plugin context plus every environment variable, `module` and `write`.
 *
 * @typeParam Uses - The points the plugin uses.
 * @typeParam Options - The plugin's options.
 */
export type FinishContext<Uses extends UsesShape, Options> = PluginContext<Uses, Options> &
  FinishHelpers

/** The names the context takes; a used point cannot have one. */
export type ReservedKeys = {
  readonly [Key in keyof (CoreContext<unknown> & FinishHelpers)]?: never
}
