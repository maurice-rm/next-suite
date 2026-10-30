import type { ModuleImport } from '../code-edit/module-import.ts'
import type { TypescriptModule } from '../code-edit/typescript-module.ts'

/** Shortcuts for `next.config.ts` on top of its module. */
export type NextConfig = {
  addImport: (moduleImport: ModuleImport) => void
  /** Sets an option of the exported config object to `code`, such as `"async () => [...]"`. */
  setOption: (key: string, code: string) => void
  /** `export default x` becomes `export default wrapper(x)`; later wrappers go outside. */
  wrap: (wrapper: string) => void
}

export const createNextConfig = (module: TypescriptModule): NextConfig => ({
  addImport: (moduleImport) => module.addImport(moduleImport),
  setOption: (key, code) => module.defaultExportObject().set(key, code),
  wrap: (wrapper) => module.wrapDefaultExport(wrapper),
})
