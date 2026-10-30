import { isAbsolute, relative, sep } from 'node:path'

const PARENT = '..'

/** Whether a path lies below a directory, not the directory itself and not on another drive. */
export const isInside = (directory: string, path: string): boolean => {
  const fromDirectory = relative(directory, path)
  return (
    fromDirectory !== '' &&
    fromDirectory !== PARENT &&
    !fromDirectory.startsWith(`${PARENT}${sep}`) &&
    !isAbsolute(fromDirectory)
  )
}

export const isInsideOrSame = (directory: string, path: string): boolean =>
  relative(directory, path) === '' || isInside(directory, path)
