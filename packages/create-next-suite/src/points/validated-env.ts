import type { TypescriptModule } from '../code-edit/typescript-module.ts'

/**
 * How code reads a validated environment variable, as the plugin that validates them states it
 * for the value point `validatedEnv`, such as t3-env with its module `@/env`. Without a provider,
 * code reads `process.env`.
 */
export type ValidatedEnv = {
  /** The import of the validated variables, such as `{ name: 'env', from: '@/env' }`. */
  readonly import: { readonly name: string; readonly from: string }
  /** The code that reads a variable by its name, such as `env.LOG_LEVEL`. */
  readonly reference: (variable: string) => string
}

/**
 * Lets top-level variables of a module read environment variables through the provider of the
 * point `validatedEnv`: the module imports the validated variables, and each variable's value
 * becomes the reference to its environment variable. Without a provider the module keeps its own
 * code, which reads `process.env`. The environment variables are declared under `env`, so the
 * provider validates them.
 *
 * @param module - The module, as a file edit gets it.
 * @param validatedEnv - The value of the point, `undefined` without a provider.
 * @param variables - The environment variable for each top-level variable, such as
 * `{ level: 'LOG_LEVEL' }`.
 * @throws CodeEditError when the module has no such top-level variable with a value.
 *
 * @example
 * ```ts
 * definePlugin({
 *   name: 'pino',
 *   title: 'pino',
 *   uses: { validatedEnv: optional(validatedEnv) },
 *   env: { LOG_LEVEL: { scope: 'server', default: 'info' } },
 *   files: {
 *     '@/lib/logger.ts': {
 *       source: 'files/lib/logger.ts',
 *       edit: (logger, { validatedEnv }) =>
 *         readFromValidatedEnv(logger, validatedEnv, { level: 'LOG_LEVEL' }),
 *     },
 *   },
 * })
 * ```
 */
export const readFromValidatedEnv = (
  module: TypescriptModule,
  validatedEnv: ValidatedEnv | undefined,
  variables: Readonly<Record<string, string>>,
): void => {
  if (validatedEnv === undefined) {
    return
  }
  module.addImport({ names: [validatedEnv.import.name], from: validatedEnv.import.from })
  for (const [variable, name] of Object.entries(variables)) {
    module.setVariable(variable, validatedEnv.reference(name))
  }
}
