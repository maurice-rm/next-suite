import { isAbsolute, relative, sep } from 'node:path'

/** Whether a path lies inside a folder, below it and not the folder itself. */
export const isInside = (folder: string, path: string): boolean => {
  const fromFolder = relative(folder, path)
  return (
    fromFolder !== '' &&
    fromFolder !== '..' &&
    !fromFolder.startsWith(`..${sep}`) &&
    !isAbsolute(fromFolder)
  )
}
