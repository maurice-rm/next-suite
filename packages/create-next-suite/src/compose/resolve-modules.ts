import type { CompositionValues } from './merge-contributions.ts'

const SOURCE_ALIAS = '#src/'

const resolveModule = (module: string, importPrefix: string): string =>
  module.startsWith(SOURCE_ALIAS) ? `${importPrefix}${module.slice(SOURCE_ALIAS.length)}` : module

const resolveEach = <Entry extends { module: string }>(
  entries: readonly Entry[],
  importPrefix: string,
): Entry[] =>
  entries.map((entry) => ({ ...entry, module: resolveModule(entry.module, importPrefix) }))

/**
 * The values with every module specifier that starts with `#src/` imported through the project's
 * import prefix instead, such as `@/lib/logger` for `#src/lib/logger`.
 */
export const resolveModules = (
  values: CompositionValues,
  importPrefix: string,
): CompositionValues => ({
  ...values,
  instrumentation: {
    register: resolveEach(values.instrumentation.register, importPrefix),
    onRequestError: resolveEach(values.instrumentation.onRequestError, importPrefix),
  },
  instrumentationClient: resolveEach(values.instrumentationClient, importPrefix),
  bodyEnd: resolveEach(values.bodyEnd, importPrefix),
  health: resolveEach(values.health, importPrefix),
})
