import { readdir, readFile } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'

/**
 * The base project's files whose names lose their leading dot in the package, since npm leaves
 * `.gitignore` out of a published package.
 */
const DOTFILES: Readonly<Record<string, string>> = {
  gitignore: '.gitignore',
  editorconfig: '.editorconfig',
  'env.example': '.env.example',
}
/** The base project's directory that lies under the source root, `src/` with `--src-dir`. */
const SOURCE_DIRECTORY = 'app/'
const SOURCE_PREFIX = '@/'

const projectPath = (path: string): string => {
  if (path.startsWith(SOURCE_DIRECTORY)) {
    return `${SOURCE_PREFIX}${path}`
  }
  return DOTFILES[path] ?? path
}

/**
 * Reads the base project, a directory of real files, by project path: `app/page.tsx` becomes
 * `@/app/page.tsx`, `gitignore` becomes `.gitignore`.
 */
export const loadBaseProject = async (directory: string): Promise<Map<string, string>> => {
  const entries = await readdir(directory, { recursive: true, withFileTypes: true })
  const files = entries
    .filter((entry) => entry.isFile())
    .map((entry) => relative(directory, join(entry.parentPath, entry.name)).split(sep).join('/'))
    .sort()
  return new Map(
    await Promise.all(
      files.map(
        async (path): Promise<[string, string]> => [
          projectPath(path),
          await readFile(join(directory, path), 'utf8'),
        ],
      ),
    ),
  )
}
