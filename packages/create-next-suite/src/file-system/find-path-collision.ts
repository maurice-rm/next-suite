/** A file and who writes it. */
type WrittenFile = { path: string; origin: string }

const parentPaths = (path: string): string[] => {
  const segments = path.split('/')
  return segments.slice(1).map((_segment, index) => segments.slice(0, index + 1).join('/'))
}

/**
 * Describes the first pair of paths that would collide on disk, or nothing: two paths that differ
 * only in case, which are one file on macOS and Windows, or a file at a path another file needs
 * as a directory.
 */
export const findPathCollision = (files: Iterable<WrittenFile>): string | undefined => {
  const byFoldedPath = new Map<string, WrittenFile>()
  for (const file of files) {
    const folded = file.path.toLowerCase()
    const other = byFoldedPath.get(folded)
    if (other !== undefined) {
      return `${other.origin} writes ${other.path} and ${file.origin} writes ${file.path}, one file on case-insensitive systems`
    }
    byFoldedPath.set(folded, file)
  }
  for (const file of byFoldedPath.values()) {
    for (const parent of parentPaths(file.path)) {
      const blocking = byFoldedPath.get(parent.toLowerCase())
      if (blocking !== undefined) {
        return `${blocking.origin} writes the file ${blocking.path}, which ${file.origin} needs as a directory for ${file.path}`
      }
    }
  }
  return undefined
}
