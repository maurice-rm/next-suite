import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

/** Writes files by their path below a root folder, creating the folders on the way. */
export const writeFiles = async (
  root: string,
  files: Readonly<Record<string, string>>,
): Promise<void> => {
  for (const [path, content] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true })
    await writeFile(join(root, path), content)
  }
}
