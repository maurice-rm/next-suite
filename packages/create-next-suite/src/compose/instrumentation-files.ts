import type { ModuleExport, NamedModuleExport } from '../contract/contributions.ts'
import type { CompositionValues } from './merge-contributions.ts'

const NODE_ONLY = ['  if (process.env.NEXT_RUNTIME !== "nodejs") {', '    return;', '  }']

const registerLine = ({ module, export: name }: ModuleExport): string => {
  const specifier = JSON.stringify(module)
  return name === undefined
    ? `  await import(${specifier});`
    : `  await (await import(${specifier})).${name}();`
}

const errorLine = ({ module, export: name }: NamedModuleExport): string =>
  `  await (await import(${JSON.stringify(module)})).${name}(error, request, context);`

/**
 * The content of instrumentation.ts from the plugins' contributions, or nothing without any. Both
 * hooks load their modules lazily and only in the Node.js runtime.
 */
export const instrumentationFile = ({
  register,
  onRequestError,
}: CompositionValues['instrumentation']): string | undefined => {
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
          ...register.map(registerLine),
          '}',
          '',
        ]),
    ...(onRequestError.length === 0
      ? []
      : [
          'export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {',
          ...NODE_ONLY,
          ...onRequestError.map(errorLine),
          '};',
          '',
        ]),
  ]
  return `${parts.join('\n').trimEnd()}\n`
}

/** The content of instrumentation-client.ts from the plugins' contributions, or nothing without any. */
export const instrumentationClientFile = (
  entries: CompositionValues['instrumentationClient'],
): string | undefined => {
  if (entries.length === 0) {
    return undefined
  }
  const imports = entries.map(({ module, export: name }) => {
    const specifier = JSON.stringify(module)
    return name === undefined ? `import ${specifier};` : `import { ${name} } from ${specifier};`
  })
  const calls = entries.flatMap(({ export: name }) => (name === undefined ? [] : [`${name}();`]))
  return `${[...imports, ...(calls.length === 0 ? [] : ['', ...calls])].join('\n')}\n`
}
