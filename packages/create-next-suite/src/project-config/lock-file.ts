import { createHash } from 'node:crypto'

import * as z from 'zod'

import { parseJsonWith } from '../file-system/read-json-file.ts'
import { formatJson } from '../project-model/format-json.ts'
import type { JsonValue } from '../project-model/json-value.ts'
import { ProjectConfigError } from './project-config-error.ts'

const HASH_ALGORITHM = 'sha256'
const CRLF = '\r\n'
const LF = '\n'
/** A content hash as trust and the lock write it: `sha256-` and 64 hex digits. */
const CONTENT_HASH = /^sha256-[0-9a-f]{64}$/
/** The source the lock records for a built-in plugin. */
export const BUILT_IN_SOURCE = 'builtin'
/** The source the lock records for a plugin defined in `next-suite.config.ts`. */
export const INLINE_SOURCE = 'inline'

const contentHash = z.string().regex(CONTENT_HASH)
const answer = z.union([z.boolean(), z.string(), z.array(z.string())])

const lockedPluginSchema = z.union([
  z.strictObject({ name: z.string(), source: z.literal(BUILT_IN_SOURCE), version: z.string() }),
  z.strictObject({ name: z.string(), source: z.literal(INLINE_SOURCE) }),
  z.strictObject({
    name: z.string(),
    source: z.string(),
    resolved: z.string().optional(),
    contentHash,
  }),
])

const fileOperationSchema = z.strictObject({
  plugin: z.string(),
  operation: z.string(),
  kind: z.enum(['own', 'extend', 'direct', 'override']),
})

const lockFileSchema = z.strictObject({
  generator: z.strictObject({ name: z.string(), version: z.string() }),
  project: z.strictObject({
    name: z.string(),
    srcDir: z.boolean(),
    importAlias: z.string(),
    reactCompiler: z.boolean(),
    cacheComponents: z.boolean(),
  }),
  plugins: z.array(lockedPluginSchema),
  disable: z.array(z.string()),
  answers: z.record(z.string(), z.record(z.string(), answer)),
  files: z.record(z.string(), contentHash),
  provenance: z.strictObject({
    order: z.array(z.string()),
    points: z.record(
      z.string(),
      z.strictObject({
        provider: z.string(),
        users: z.array(z.string()),
        contributors: z.array(z.string()),
      }),
    ),
    files: z.record(z.string(), z.array(fileOperationSchema)),
  }),
})

/**
 * What `.next-suite/lock.json` records about the last generation: the generator, the project's
 * settings, every plugin with where it came from and which version or content ran, the disabled
 * plugins, every answer including defaults, a hash of each generated file as written and which
 * plugin did what to it.
 */
export type LockFile = z.output<typeof lockFileSchema>

/** A plugin as the lock records it. */
export type LockedPlugin = LockFile['plugins'][number]

/** The project's settings as the lock records them, every one with its value. */
export type LockedProject = LockFile['project']

/**
 * The hash of a file's text: `sha256-` and the hex digest, like a plugin's content hash. Line
 * endings count as `\n`, so a file Git checks out with CRLF, as on Windows, keeps its hash.
 */
export const hashFileContent = (content: string): string =>
  `${HASH_ALGORITHM}-${createHash(HASH_ALGORITHM).update(content.replaceAll(CRLF, LF)).digest('hex')}`

/** The text of a lock file; a field without a value, such as no `resolved`, is left out. */
export const renderLockFile = (lock: LockFile): string => {
  const json: JsonValue = JSON.parse(JSON.stringify(lock))
  return formatJson(json)
}

/**
 * Reads the text of a lock file; `path` names it in errors.
 *
 * @throws ProjectConfigError for text that is no JSON or no lock.
 */
export const parseLockFile = (text: string, path: string): LockFile =>
  parseJsonWith(
    text,
    lockFileSchema,
    (problem, options) => new ProjectConfigError(`${path} ${problem}`, options),
  )
