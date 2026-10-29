import { ComposeError } from './compose-error.ts'
import type { VirtualFile, VirtualFiles } from './virtual-files.ts'

const parentPaths = (path: string): string[] => {
  const segments = path.split('/')
  return segments.slice(1).map((_segment, index) => segments.slice(0, index + 1).join('/'))
}

/**
 * Rejects paths that would collide on disk: two paths that differ only in case, which are one file
 * on macOS and Windows, and a file at a path another file needs as a folder.
 */
export const assertNoPathCollisions = (files: VirtualFiles): void => {
  const byFoldedPath = new Map<string, VirtualFile>()
  for (const file of files.values()) {
    const folded = file.path.toLowerCase()
    const other = byFoldedPath.get(folded)
    if (other !== undefined) {
      throw new ComposeError(
        `${other.origin} writes ${other.path} and ${file.origin} writes ${file.path}, one file on case-insensitive systems`,
      )
    }
    byFoldedPath.set(folded, file)
  }
  for (const file of files.values()) {
    for (const parent of parentPaths(file.path)) {
      const blocking = byFoldedPath.get(parent.toLowerCase())
      if (blocking !== undefined) {
        throw new ComposeError(
          `${blocking.origin} writes the file ${blocking.path}, which ${file.origin} needs as a folder for ${file.path}`,
        )
      }
    }
  }
}
