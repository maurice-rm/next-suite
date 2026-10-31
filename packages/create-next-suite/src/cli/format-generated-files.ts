import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { isMissingFileError } from '../file-system/error-code.ts'
import type { CommandRunner } from '../post-steps/run-command.ts'

const NODE_MODULES = 'node_modules'
/** How many characters of a failed command's output a problem quotes. */
const MAX_OUTPUT_LENGTH = 300

/** The files as formatted, or why they could not be. */
export type FormatResult =
  | { kind: 'formatted'; files: Map<string, string> }
  | { kind: 'failed'; problem: string }

/** What formatting generated files needs: the project's installed packages and how to run. */
type FormatRun = {
  /** The project, whose `node_modules` holds the formatter. */
  projectDirectory: string
  /** The package manager whose `run` starts each script. */
  packageManager: string
  /** The post-step scripts to run, such as `format`. */
  scripts: readonly string[]
  runCommand: CommandRunner
}

const readBack = async (
  directory: string,
  paths: Iterable<string>,
): Promise<Map<string, string>> => {
  const files = new Map<string, string>()
  for (const path of paths) {
    try {
      files.set(path, await readFile(join(directory, path), 'utf8'))
    } catch (error) {
      if (!isMissingFileError(error)) {
        throw error
      }
    }
  }
  return files
}

const tailOf = (output: string): string => output.trim().slice(-MAX_OUTPUT_LENGTH)

/**
 * Runs the post-step scripts of a generation, such as the formatter, over generated files the way
 * the run after create did over the new project: the files go into a fresh temporary directory
 * that sees the project's `node_modules` through a link, and each script runs there with the
 * package manager. Without scripts, the files stay as they are.
 */
export const formatGeneratedFiles = async (
  files: ReadonlyMap<string, string>,
  { projectDirectory, packageManager, scripts, runCommand }: FormatRun,
): Promise<FormatResult> => {
  if (scripts.length === 0) {
    return { kind: 'formatted', files: new Map(files) }
  }
  const installed = join(projectDirectory, NODE_MODULES)
  if (!existsSync(installed)) {
    return {
      kind: 'failed',
      problem: `${NODE_MODULES} is missing; install the dependencies first`,
    }
  }
  const directory = await mkdtemp(join(tmpdir(), 'next-suite-format-'))
  try {
    for (const [path, content] of files) {
      await mkdir(dirname(join(directory, path)), { recursive: true })
      await writeFile(join(directory, path), content)
    }
    await symlink(installed, join(directory, NODE_MODULES), 'junction')
    for (const script of scripts) {
      const result = await runCommand(packageManager, ['run', script], directory)
      if (!result.isSuccess) {
        return {
          kind: 'failed',
          problem: `\`${packageManager} run ${script}\` failed: ${tailOf(result.output)}`,
        }
      }
    }
    return {
      kind: 'formatted',
      files: await readBack(directory, files.keys()),
    }
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}
