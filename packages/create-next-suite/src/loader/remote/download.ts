import type * as z from 'zod'

import { type JsonErrorFactory, parseJsonWith } from '../../file-system/read-json-file.ts'
import { PluginLoadError } from '../plugin-load-error.ts'
import type { RemoteEnvironment } from './remote-source.ts'

const DOWNLOAD_TIMEOUT_MS = 60_000
/** Far above any plugin, small enough that a hostile server cannot fill the disk. */
const MAX_DOWNLOAD_BYTES = 50 * 1024 * 1024
const MAX_REDIRECTS = 5
const FIRST_REDIRECT_STATUS = 300
const FIRST_ERROR_STATUS = 400

/** A URL to download and the headers to send with it, such as an access token. */
export type DownloadRequest = { url: string; headers?: Readonly<Record<string, string>> }

const isRedirect = (status: number): boolean =>
  status >= FIRST_REDIRECT_STATUS && status < FIRST_ERROR_STATUS

/** The error for an answer of a server that cannot be used, such as invalid JSON. */
export const invalidAnswerError =
  (url: string): JsonErrorFactory =>
  (problem, options) =>
    new PluginLoadError(url, `the answer ${problem}`, options)

/**
 * Downloads a URL. Headers such as access tokens go only to the origin they were meant for: a
 * redirect to another origin is followed without them.
 */
export const download = async (
  environment: RemoteEnvironment,
  { url, headers = {} }: DownloadRequest,
): Promise<Buffer> => {
  let current = url
  let currentHeaders = headers
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    const response = await environment.fetch(current, {
      headers: currentHeaders,
      redirect: 'manual',
      signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
    })
    const location = response.headers.get('location')
    if (isRedirect(response.status) && location !== null) {
      const next = new URL(location, current)
      if (next.origin !== new URL(current).origin) {
        currentHeaders = {}
      }
      current = next.href
      continue
    }
    if (!response.ok) {
      throw new PluginLoadError(url, `the download failed with HTTP ${response.status}`)
    }
    const body = Buffer.from(await response.arrayBuffer())
    if (body.length > MAX_DOWNLOAD_BYTES) {
      throw new PluginLoadError(url, 'the download is larger than a plugin can be')
    }
    return body
  }
  throw new PluginLoadError(url, 'the download redirected too often')
}

/** Downloads a URL and checks the JSON it answers against a schema. */
export const downloadJson = async <Schema extends z.ZodType>(
  environment: RemoteEnvironment,
  request: DownloadRequest,
  schema: Schema,
): Promise<z.output<Schema>> => {
  const text = (await download(environment, request)).toString('utf8')
  return parseJsonWith(text, schema, invalidAnswerError(request.url))
}
