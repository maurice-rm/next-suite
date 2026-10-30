/**
 * How an operation reached a file: `own` on a file the plugin writes itself, `extend` through what
 * the file's owner offers (a section such as `dependencies` or `layout`), `direct` as an edit of a
 * file someone else owns, which can break when that file changes, `override` as the project's own
 * file under `next-suite/overrides/` that replaces the generated one.
 */
export type OperationKind = 'own' | 'extend' | 'direct' | 'override'

/** One thing a plugin did to a file, such as `copy files/auth.ts` or `dependencies pino`. */
export type FileOperation = { plugin: string; operation: string; kind: OperationKind }

type PointRecord = { provider: string; users: string[]; contributors: string[] }

/** Which plugin did what to which file and point, in the order it happened. */
export type ProvenanceLog = {
  order: string[]
  points: Record<string, PointRecord>
  files: Record<string, FileOperation[]>
}

/** Records which plugin did what to which file and point. Paths are paths on disk. */
export type Provenance = {
  record: (entry: FileOperation & { path: string }) => void
  operationsOf: (path: string) => readonly FileOperation[]
  /** The plugins in the order they ran. */
  recordOrder: (pluginNames: readonly string[]) => void
  recordProvider: (point: string, provider: string) => void
  recordUse: (point: string, user: string) => void
  recordContribution: (point: string, contributor: string) => void
  /** The log, files sorted by path. */
  toJson: () => ProvenanceLog
}

export const createProvenance = (): Provenance => {
  const files = new Map<string, FileOperation[]>()
  const points = new Map<string, PointRecord>()
  let order: string[] = []

  return {
    record: ({ path, ...operation }) => {
      files.set(path, [...(files.get(path) ?? []), operation])
    },
    operationsOf: (path) => files.get(path) ?? [],
    recordOrder: (pluginNames) => {
      order = [...pluginNames]
    },
    recordProvider: (point, provider) => {
      points.set(point, { provider, users: [], contributors: [] })
    },
    recordUse: (point, user) => {
      points.get(point)?.users.push(user)
    },
    recordContribution: (point, contributor) => {
      points.get(point)?.contributors.push(contributor)
    },
    toJson: () => ({
      order,
      points: Object.fromEntries(points),
      files: Object.fromEntries([...files].sort(([left], [right]) => (left < right ? -1 : 1))),
    }),
  }
}
