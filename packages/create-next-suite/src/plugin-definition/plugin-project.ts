import type { TypescriptModule } from '../code-edit/typescript-module.ts'
import type { JsonValue } from '../project-model/json-value.ts'

/**
 * What a plugin's `setup` gets: the operations no other field covers. Each one is recorded as the
 * plugin's, with `setup:` in front.
 */
export type PluginProject = {
  packageJson: {
    /** Sets a top-level field of `package.json`, such as `engines`. */
    setField: (name: string, value: JsonValue) => void
  }
  tsconfig: {
    /** Adds a path to `compilerOptions.paths`, such as `#content/*`. */
    addPath: (alias: string, targets: readonly string[]) => void
    /** Adds a pattern to `include`, for files its globs miss. */
    addInclude: (pattern: string) => void
  }
  /** The module of a TypeScript file of the project. */
  module: (path: string) => TypescriptModule
  /** Adds a file the plugin owns. */
  write: (path: string, content: string) => void
}
