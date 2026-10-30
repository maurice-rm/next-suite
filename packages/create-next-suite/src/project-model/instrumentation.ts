const NODE_ONLY = ['  if (process.env.NEXT_RUNTIME !== "nodejs") {', '    return;', '  }']

/** A module an instrumentation hook loads, and the export it calls; without one, it only imports. */
export type ModuleExport = { module: string; export?: string }

/** A module an instrumentation hook loads and the export it calls. */
export type NamedModuleExport = { module: string; export: string }

/**
 * The hooks of `instrumentation.ts` and `instrumentation-client.ts`. Each entry is listed once, in
 * the order it was added.
 */
export type Instrumentation = {
  register: (entry: ModuleExport) => void
  onRequestError: (entry: NamedModuleExport) => void
  /** Adds an import to `instrumentation-client.ts`, and a call when the entry names an export. */
  addClient: (entry: ModuleExport) => void
  /** The content of `instrumentation.ts`, or nothing when no plugin uses a hook. */
  renderServer: () => string | undefined
  /** The content of `instrumentation-client.ts`, or nothing without an entry. */
  renderClient: () => string | undefined
}

const registerLine = ({ module, export: name }: ModuleExport): string => {
  const specifier = JSON.stringify(module)
  return name === undefined
    ? `  await import(${specifier});`
    : `  await (await import(${specifier})).${name}();`
}

const errorLine = ({ module, export: name }: NamedModuleExport): string =>
  `  await (await import(${JSON.stringify(module)})).${name}(error, request, context);`

const clientImport = ({ module, export: name }: ModuleExport): string => {
  const specifier = JSON.stringify(module)
  return name === undefined ? `import ${specifier};` : `import { ${name} } from ${specifier};`
}

/** Adds `entry` to `entries` unless an equal one is there. */
const addOnce = <Entry extends ModuleExport>(entries: Entry[], entry: Entry): void => {
  const isPresent = entries.some(
    (present) => present.module === entry.module && present.export === entry.export,
  )
  if (!isPresent) {
    entries.push(entry)
  }
}

export const createInstrumentation = (): Instrumentation => {
  const register: ModuleExport[] = []
  const onRequestError: NamedModuleExport[] = []
  const client: ModuleExport[] = []

  return {
    register: (entry) => addOnce(register, entry),
    onRequestError: (entry) => addOnce(onRequestError, entry),
    addClient: (entry) => addOnce(client, entry),

    renderServer: () => {
      if (register.length === 0 && onRequestError.length === 0) {
        return undefined
      }
      const parts = [
        ...(onRequestError.length === 0
          ? []
          : ['import type { Instrumentation } from "next";', '']),
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
    },

    renderClient: () => {
      if (client.length === 0) {
        return undefined
      }
      const calls = client.flatMap(({ export: name }) => (name === undefined ? [] : [`${name}();`]))
      const lines = [...client.map(clientImport), ...(calls.length === 0 ? [] : ['', ...calls])]
      return `${lines.join('\n')}\n`
    },
  }
}
