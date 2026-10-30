import type { ExtendedValues } from './merge-extended-points.ts'

const SOURCE_ALIAS = '#src/'

type ModuleExport = { module: string; export?: string | undefined }

/** A module specifier with `#src/` replaced by the project's import prefix, such as `@/`. */
export const resolveModule = (module: string, importPrefix: string): string =>
  module.startsWith(SOURCE_ALIAS) ? `${importPrefix}${module.slice(SOURCE_ALIAS.length)}` : module

const NODE_ONLY = ['  if (process.env.NEXT_RUNTIME !== "nodejs") {', '    return;', '  }']

const registerLine = ({ module, export: name }: ModuleExport, importPrefix: string): string => {
  const specifier = JSON.stringify(resolveModule(module, importPrefix))
  return name === undefined
    ? `  await import(${specifier});`
    : `  await (await import(${specifier})).${name}();`
}

const errorLine = (
  { module, export: name }: { module: string; export: string },
  importPrefix: string,
): string => {
  const specifier = JSON.stringify(resolveModule(module, importPrefix))
  return `  await (await import(${specifier})).${name}(error, request, context);`
}

/**
 * The content of instrumentation.ts from the plugins' contributions, or nothing without any. Both
 * hooks load their modules lazily and only in the Node.js runtime.
 */
export const instrumentationFile = (
  { register, onRequestError }: ExtendedValues['instrumentation'],
  importPrefix: string,
): string | undefined => {
  if (register.length === 0 && onRequestError.length === 0) {
    return undefined
  }
  const parts = [
    ...(onRequestError.length === 0 ? [] : ['import type { Instrumentation } from "next";', '']),
    ...(register.length === 0
      ? []
      : [
          'export async function register() {',
          ...NODE_ONLY,
          ...register.map((entry) => registerLine(entry, importPrefix)),
          '}',
          '',
        ]),
    ...(onRequestError.length === 0
      ? []
      : [
          'export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {',
          ...NODE_ONLY,
          ...onRequestError.map((entry) => errorLine(entry, importPrefix)),
          '};',
          '',
        ]),
  ]
  return `${parts.join('\n').trimEnd()}\n`
}

/** The content of instrumentation-client.ts from the plugins' contributions, or nothing without any. */
export const instrumentationClientFile = (
  entries: ExtendedValues['instrumentationClient'],
  importPrefix: string,
): string | undefined => {
  if (entries.length === 0) {
    return undefined
  }
  const imports = entries.map(({ module, export: name }) => {
    const specifier = JSON.stringify(resolveModule(module, importPrefix))
    return name === undefined ? `import ${specifier};` : `import { ${name} } from ${specifier};`
  })
  const calls = entries.flatMap(({ export: name }) => (name === undefined ? [] : [`${name}();`]))
  return `${[...imports, ...(calls.length === 0 ? [] : ['', ...calls])].join('\n')}\n`
}
