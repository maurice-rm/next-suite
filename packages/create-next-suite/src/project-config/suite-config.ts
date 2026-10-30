import type { Plugin } from '../plugin-definition/plugin-definition.ts'

/**
 * The plugins a project's `next-suite.config.ts` can name, each with the answers its options take.
 * It is empty here; the `.next-suite/types.d.ts` create-next-suite writes into every project fills
 * it with every plugin the project can use, so plugin names and answers are checked in the editor.
 *
 * @example
 * ```ts
 * declare module 'create-next-suite/config' {
 *   interface PluginRegistry {
 *     pino: { level: 'debug' | 'info' }
 *     knip: Record<never, never>
 *   }
 * }
 * ```
 */
// biome-ignore lint/suspicious/noEmptyInterface: filled by module augmentation in the generated project
export interface PluginRegistry {}

/** The name of a plugin the registry knows, such as `pino`. */
export type PluginName = keyof PluginRegistry

/** The plugins of the registry that have options; only they take answers. */
type AskingPluginName = {
  [Name in PluginName]: keyof PluginRegistry[Name] extends never ? never : Name
}[PluginName]

/**
 * A plugin directory by its path relative to `next-suite.config.ts`, such as
 * `./next-suite/plugins/tweaks`, or by its absolute path.
 */
export type LocalPluginPath = `./${string}` | `../${string}` | `/${string}`

/**
 * Where a plugin outside the project comes from, as `--plugin` takes it: npm, GitHub, GitLab, any
 * Git repository, a tarball URL, or a registry's short name such as `@acme/mail`.
 */
export type ExternalPluginAddress =
  | `npm:${string}`
  | `github:${string}`
  | `gitlab:${string}`
  | `git+${string}`
  | `https://${string}`
  | `@${string}/${string}`

/** A plugin of the project: by name, by its directory or address, or defined in place. */
export type PluginEntry = PluginName | LocalPluginPath | ExternalPluginAddress | Plugin

/**
 * The project's settings, which the core applies to the base project before any plugin runs. The
 * source directory and the import alias cannot change once the project is created.
 */
export type ProjectSettings = {
  /** The package name. */
  readonly name: string
  /** Whether the code lies inside `src/`; `false` by default. */
  readonly srcDir?: boolean
  /** The import alias of the source root; `@/*` by default. */
  readonly importAlias?: string
  /** Whether the React Compiler runs; `false` by default. */
  readonly reactCompiler?: boolean
  /** Whether Cache Components are on; `true` by default. */
  readonly cacheComponents?: boolean
}

/** The answer to each option, by plugin; an option without one takes its default. */
export type PluginAnswers = {
  readonly [Name in AskingPluginName]?: Partial<PluginRegistry[Name]>
}

/** What `next-suite.config.ts` says about a project: its settings, its plugins and their answers. */
export type SuiteConfig = {
  readonly project: ProjectSettings
  /** The project's plugins, in any order. */
  readonly plugins: readonly PluginEntry[]
  /** Plugins that do not run, even when `plugins` names them. */
  readonly disable?: readonly PluginName[]
  readonly answers?: PluginAnswers
}

/**
 * Declares a project's `next-suite.config.ts`. create-next-suite writes it when it creates the
 * project and reads it to create the same project again; it checks names and answers against the
 * plugins in `.next-suite/types.d.ts`.
 *
 * @param config - The project's settings, plugins and answers.
 * @returns The config as given.
 *
 * @example
 * ```ts
 * import { defineSuiteConfig } from 'create-next-suite/config'
 *
 * export default defineSuiteConfig({
 *   project: { name: 'my-app', srcDir: false, importAlias: '@/*' },
 *   plugins: ['pnpm', 'eslint', 'pino', './next-suite/plugins/tweaks'],
 *   disable: [],
 *   answers: { pino: { level: 'info' } },
 * })
 * ```
 */
export const defineSuiteConfig = (config: SuiteConfig): SuiteConfig => config
