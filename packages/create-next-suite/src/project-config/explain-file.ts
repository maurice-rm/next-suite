import type { FileOperation } from '../project-model/provenance.ts'
import { hashFileContent, type LockFile } from './lock-file.ts'

/** How explain names the writer of a file no plugin wrote, such as `instrumentation.ts`. */
const CORE_WRITER = 'the core'
const NUMBER_WIDTH = 3

type ExplainInput = {
  lock: LockFile
  /** The file's path in the project, with `/` as separator. */
  path: string
  /** The file's text now, or nothing when it is gone. */
  content: string | undefined
}

/** The plugin that wrote a file first: the first that owns it, or the core. */
const writerOf = (operations: readonly FileOperation[]): string =>
  operations.find(({ kind }) => kind === 'own')?.plugin ?? CORE_WRITER

const stateOf = ({ lock, path, content }: ExplainInput): string => {
  if (content === undefined) {
    return 'deleted since it was generated'
  }
  return hashFileContent(content) === lock.files[path]
    ? 'unchanged since it was generated'
    : 'changed since it was generated'
}

/** The kind of an operation, with where a project or external plugin came from for a direct edit. */
const describeKind = (
  operation: FileOperation,
  { lock, writer }: { lock: LockFile; writer: string },
) => {
  if (operation.kind !== 'direct') {
    return operation.kind
  }
  const source = lock.plugins.find(({ name }) => name === operation.plugin)
  const origin = source === undefined || !('contentHash' in source) ? '' : ` (${source.source})`
  return `direct${origin}; may break when ${writer} changes`
}

/**
 * What next-suite did to a file, from the lock: who wrote it and whether it still is as generated,
 * then every operation in the order it ran with its plugin and kind: `own`, `extend`, `direct` or
 * `override`. A direct edit names where its plugin came from and warns that it may break.
 */
export const explainFile = (input: ExplainInput): string[] => {
  const { lock, path } = input
  const operations = lock.provenance.files[path]
  if (operations === undefined) {
    return [`next-suite did not write ${path}; it is entirely yours`]
  }
  const writer = writerOf(operations)
  const pluginWidth = Math.max(...operations.map(({ plugin }) => plugin.length))
  const operationWidth = Math.max(...operations.map(({ operation }) => operation.length))
  return [
    `${path}: written by ${writer}, ${stateOf(input)}`,
    ...operations.map((operation, index) =>
      [
        `${String(index + 1).padStart(NUMBER_WIDTH)}. ${operation.plugin.padEnd(pluginWidth)}`,
        operation.operation.padEnd(operationWidth),
        describeKind(operation, { lock, writer }),
      ].join('  '),
    ),
  ]
}
