import { lstat, readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { isMissingFileError } from '../file-system/error-code.ts'
import { formatJson } from '../project-model/format-json.ts'
import type { JsonValue } from '../project-model/json-value.ts'
import { decideFileUpdate, type FileSides } from './decide-file-update.ts'
import { hashFileContent } from './lock-file.ts'
import { type KeyMergeConflict, mergeJson } from './merge-json.ts'
import { mergeText } from './merge-text.ts'

const JSON_FILE = /\.json$/
const CRLF = '\r\n'
const LF = '\n'

/** A file whose merge left merge conflicts: markers in a text file, keys in a JSON file. */
export type MergeConflict =
  | { path: string; kind: 'text'; count: number }
  | { path: string; kind: 'json'; keys: KeyMergeConflict[] }

/** What an update does to the files of a project, by path. */
export type UpdateReport = {
  /** Files you had not changed, replaced with the new output. */
  replaced: string[]
  /** Files both sides changed, merged without a merge conflict. */
  merged: string[]
  added: string[]
  removed: string[]
  /** Files the update leaves alone although the new output differs, and why. */
  kept: { path: string; reason: string }[]
  mergeConflicts: MergeConflict[]
}

/** A file to write, or to remove when it has no content. */
export type FileChange = { path: string; content: string | undefined }

/** The report of an update and the changes that carry it out. */
export type FileUpdates = { report: UpdateReport; changes: FileChange[] }

/** The working tree's file at a path: its text, nothing, or a path that is no regular file. */
type WorkingFile = { kind: 'file'; content: string } | { kind: 'missing' } | { kind: 'other' }

type MergeResult = { content: string; conflict: MergeConflict | undefined }

const readWorkingFile = async (path: string): Promise<WorkingFile> => {
  try {
    const entry = await lstat(path)
    if (!entry.isFile()) {
      return { kind: 'other' }
    }
    return { kind: 'file', content: await readFile(path, 'utf8') }
  } catch (error) {
    if (isMissingFileError(error)) {
      return { kind: 'missing' }
    }
    throw error
  }
}

const parseJson = (text: string): JsonValue | undefined => {
  try {
    return JSON.parse(text)
  } catch (error) {
    if (error instanceof SyntaxError) {
      return undefined
    }
    throw error
  }
}

/** Merges by key where every side is plain JSON; otherwise nothing, and the file merges as text. */
const mergeAsJson = (
  path: string,
  sides: { base: string | undefined; ours: string; theirs: string },
): MergeResult | undefined => {
  const base = sides.base === undefined ? undefined : parseJson(sides.base)
  const ours = parseJson(sides.ours)
  const theirs = parseJson(sides.theirs)
  if (
    ours === undefined ||
    theirs === undefined ||
    (sides.base !== undefined && base === undefined)
  ) {
    return undefined
  }
  const merged = mergeJson({ base, ours, theirs })
  return {
    content: merged.value === undefined ? '' : formatJson(merged.value),
    conflict:
      merged.conflicts.length === 0 ? undefined : { path, kind: 'json', keys: merged.conflicts },
  }
}

const mergeFile = async (
  path: string,
  sides: { base: string | undefined; ours: string; theirs: string },
): Promise<MergeResult> => {
  const json = JSON_FILE.test(path) ? mergeAsJson(path, sides) : undefined
  if (json !== undefined) {
    return json
  }
  const merged = await mergeText({
    base: sides.base ?? '',
    ours: sides.ours.replaceAll(CRLF, LF),
    theirs: sides.theirs,
  })
  return {
    content: merged.content,
    conflict: merged.conflicts === 0 ? undefined : { path, kind: 'text', count: merged.conflicts },
  }
}

/** The text of a side the decision needs, which is there for every decision but none. */
const required = (text: string | undefined, path: string): string => {
  if (text === undefined) {
    throw new Error(`the update of ${path} lacks a side its decision needs`)
  }
  return text
}

const updateFile = async (
  path: string,
  sides: FileSides,
  { report, changes }: FileUpdates,
): Promise<void> => {
  const decision = decideFileUpdate(sides)
  switch (decision.kind) {
    case 'none':
      return
    case 'replace':
      report.replaced.push(path)
      changes.push({ path, content: required(sides.theirs, path) })
      return
    case 'add':
      report.added.push(path)
      changes.push({ path, content: required(sides.theirs, path) })
      return
    case 'remove':
      report.removed.push(path)
      changes.push({ path, content: undefined })
      return
    case 'keep':
      report.kept.push({ path, reason: decision.reason })
      return
    case 'merge': {
      const merged = await mergeFile(path, {
        base: sides.base,
        ours: required(sides.ours, path),
        theirs: required(sides.theirs, path),
      })
      changes.push({ path, content: merged.content })
      if (merged.conflict === undefined) {
        report.merged.push(path)
      } else {
        report.mergeConflicts.push(merged.conflict)
      }
    }
  }
}

/**
 * Works out what an update does to each file of a project, without writing: the old output
 * (`old`) is the base of a three-way merge, the working tree is yours and the new output
 * (`next`) next-suite's. `lockHashes` are the hashes the lock recorded for the files as written,
 * which tell whether you changed a file. A path that is no regular file in the working tree, such
 * as a link, is kept.
 */
export const planFileUpdates = async (
  projectDirectory: string,
  {
    old,
    next,
    lockHashes,
  }: {
    old: ReadonlyMap<string, string>
    next: ReadonlyMap<string, string>
    lockHashes: Readonly<Record<string, string>>
  },
): Promise<FileUpdates> => {
  const updates: FileUpdates = {
    report: {
      replaced: [],
      merged: [],
      added: [],
      removed: [],
      kept: [],
      mergeConflicts: [],
    },
    changes: [],
  }
  const paths = [...new Set([...old.keys(), ...next.keys()])].sort()
  for (const path of paths) {
    const working = await readWorkingFile(join(projectDirectory, path))
    if (working.kind === 'other') {
      updates.report.kept.push({ path, reason: 'it is no regular file' })
      continue
    }
    const ours = working.kind === 'file' ? working.content : undefined
    const base = old.get(path)
    const recorded = lockHashes[path] ?? (base === undefined ? undefined : hashFileContent(base))
    await updateFile(
      path,
      {
        base,
        ours,
        theirs: next.get(path),
        isUnchanged: ours !== undefined && hashFileContent(ours) === recorded,
      },
      updates,
    )
  }
  return updates
}
