import { readdir } from 'node:fs/promises'

/** The names of the directories directly inside a directory, sorted. */
export const listDirectories = async (directory: string): Promise<string[]> => {
  const entries = await readdir(directory, { withFileTypes: true })
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
}
