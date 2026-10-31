import type { CommandRunner } from '../post-steps/run-command.ts'
import { hashFileContent } from '../project-config/lock-file.ts'
import { formatGeneratedFiles } from './format-generated-files.ts'

/** The old and the new output, both as raw or both as formatted, and what to know about it. */
export type AlignedOutputs = {
  old: Map<string, string>
  next: Map<string, string>
  warnings: string[]
}

/** The two outputs and how the project formats its files. */
type Outputs = {
  old: ReadonlyMap<string, string>
  next: ReadonlyMap<string, string>
  /** The hashes the lock recorded for the files as the last run left them. */
  lockHashes: Readonly<Record<string, string>>
  /** The post-step scripts of each output, such as `format`. */
  oldScripts: readonly string[]
  nextScripts: readonly string[]
  projectDirectory: string
  packageManager: string
  runCommand: CommandRunner
}

const countMatches = (
  files: ReadonlyMap<string, string>,
  lockHashes: Readonly<Record<string, string>>,
): number =>
  [...files].filter(([path, content]) => lockHashes[path] === hashFileContent(content)).length

/**
 * Formats the old and the new output the way the project's post-steps, such as its formatter,
 * formatted the files after create, so a file you did not touch matches the lock and the merge
 * compares like with like. Whether the project ran them is read from the lock: when the raw old
 * output matches every hash, nothing runs; otherwise the old output is formatted, and kept so
 * only when it matches the hashes better than the raw one, as after an install; the new output
 * then follows. When a script cannot run, the outputs stay raw and a warning says what that
 * means.
 */
export const formatLikeTheProject = async (outputs: Outputs): Promise<AlignedOutputs> => {
  const run = {
    projectDirectory: outputs.projectDirectory,
    packageManager: outputs.packageManager,
    runCommand: outputs.runCommand,
  }
  const raw = {
    old: new Map(outputs.old),
    next: new Map(outputs.next),
    warnings: [],
  }
  const rawMatches = countMatches(outputs.old, outputs.lockHashes)
  if (outputs.oldScripts.length === 0 || rawMatches === Object.keys(outputs.lockHashes).length) {
    return raw
  }
  const old = await formatGeneratedFiles(outputs.old, {
    ...run,
    scripts: outputs.oldScripts,
  })
  if (old.kind === 'failed') {
    return {
      ...raw,
      warnings: [
        `could not run the post-steps of the old output (${old.problem}); files formatted after create may count as changed by you`,
      ],
    }
  }
  if (countMatches(old.files, outputs.lockHashes) <= rawMatches) {
    return raw
  }
  const next = await formatGeneratedFiles(outputs.next, {
    ...run,
    scripts: outputs.nextScripts,
  })
  if (next.kind === 'failed') {
    return {
      old: old.files,
      next: new Map(outputs.next),
      warnings: [
        `could not run the post-steps of the new output (${next.problem}); the new output is written unformatted, so run your formatter after the update`,
      ],
    }
  }
  return { old: old.files, next: next.files, warnings: [] }
}
