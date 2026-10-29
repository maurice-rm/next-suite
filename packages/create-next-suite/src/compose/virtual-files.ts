import { ComposeError } from './compose-error.ts'

export type ConflictStrategy = 'error' | 'skip-if-exists' | 'replace'

export type VirtualFile = {
  path: string
  content: string
  origin: string
}

type FileContribution = VirtualFile & {
  conflict: ConflictStrategy
  replaceable: ReadonlySet<string>
}

/** The files of a project before anything is written, keyed by path. */
export type VirtualFiles = Map<string, VirtualFile>

const replace = (files: VirtualFiles, file: FileContribution, existing: VirtualFile): void => {
  if (!file.replaceable.has(existing.origin)) {
    throw new ComposeError(
      `${file.origin} replaces ${file.path} from ${existing.origin}, but does not require ${existing.origin}`,
    )
  }
  files.set(file.path, { path: file.path, content: file.content, origin: file.origin })
}

/**
 * Adds a file by its conflict strategy. A second file at the same path is an error unless the
 * content is identical; `skip-if-exists` keeps the first; `replace` overrides a file of a plugin
 * the replacing plugin requires.
 */
export const addFile = (files: VirtualFiles, file: FileContribution): void => {
  const existing = files.get(file.path)
  if (existing === undefined) {
    files.set(file.path, { path: file.path, content: file.content, origin: file.origin })
    return
  }
  if (file.conflict === 'skip-if-exists' || existing.content === file.content) {
    return
  }
  if (file.conflict === 'replace') {
    replace(files, file, existing)
    return
  }
  throw new ComposeError(`${existing.origin} and ${file.origin} both write ${file.path}`)
}
