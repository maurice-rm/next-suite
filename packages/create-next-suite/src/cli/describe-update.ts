import type { MergeConflict, UpdateReport } from '../project-config/plan-file-updates.ts'
import type { JsonValue } from '../project-model/json-value.ts'

const INDENT = '  '

const describeValue = (value: JsonValue | undefined): string =>
  value === undefined ? 'removed' : JSON.stringify(value)

const describeConflict = (conflict: MergeConflict): string[] => {
  if (conflict.kind === 'text') {
    const count = conflict.count === 1 ? '1 merge conflict' : `${conflict.count} merge conflicts`
    return [`${conflict.path}: ${count}, between <<<<<<< yours and >>>>>>> next-suite`]
  }
  return [
    `${conflict.path}: your value is kept where next-suite changed it too`,
    ...conflict.keys.map(
      ({ path, ours, theirs }) =>
        `${INDENT}${path}: yours ${describeValue(ours)}, next-suite ${describeValue(theirs)}`,
    ),
  ]
}

const section = (title: string, lines: readonly string[]): string[] =>
  lines.length === 0 ? [] : [`${title}:`, ...lines.map((line) => `${INDENT}${line}`)]

/** Whether an update changes any file. */
export const changesFiles = (report: UpdateReport): boolean =>
  [report.replaced, report.merged, report.added, report.removed, report.mergeConflicts].some(
    (paths) => paths.length > 0,
  )

/**
 * What an update did to the files, by what happened to each, then its warnings and notes; a
 * section without files is left out.
 */
export const describeUpdate = (
  report: UpdateReport,
  { warnings, notes }: { warnings: readonly string[]; notes: readonly string[] },
): string[] => [
  ...section('Replaced, unchanged by you', report.replaced),
  ...section('Merged with your changes', report.merged),
  ...section('Added', report.added),
  ...section('Removed', report.removed),
  ...section(
    'Kept',
    report.kept.map(({ path, reason }) => `${path}: ${reason}`),
  ),
  ...section('Merge conflicts', report.mergeConflicts.flatMap(describeConflict)),
  ...warnings.map((warning) => `Warning: ${warning}.`),
  ...notes.map((note) => `Note: ${note}.`),
]
