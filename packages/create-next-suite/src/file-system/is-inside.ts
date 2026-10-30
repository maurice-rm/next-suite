import { isAbsolute, relative, sep } from 'node:path'

const PARENT = '..'

/** Whether a path lies below a folder, not the folder itself and not on another drive. */
export const isInside = (folder: string, path: string): boolean => {
  const fromFolder = relative(folder, path)
  return (
    fromFolder !== '' &&
    fromFolder !== PARENT &&
    !fromFolder.startsWith(`${PARENT}${sep}`) &&
    !isAbsolute(fromFolder)
  )
}

/** Whether a path is a folder itself or lies below it. */
export const isInsideOrSame = (folder: string, path: string): boolean =>
  relative(folder, path) === '' || isInside(folder, path)
