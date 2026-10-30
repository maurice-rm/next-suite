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
const SECURE_PROTOCOL = 'https:'

/** A URL to download and the headers to send with it, such as an access token. */
export type DownloadRequest = {
  url: string
  headers?: Readonly<Record<string, string>>
}

const isRedirect = (status: number): boolean =>
  status >= FIRST_REDIRECT_STATUS && status < FIRST_ERROR_STATUS

const tooLargeError = (url: string): PluginLoadError =>
  new PluginLoadError(url, 'the download is larger than a plugin can be')

/** The error for an answer of a server that cannot be used, such as invalid JSON. */
export const invalidAnswerError =
  (url: string): JsonErrorFactory =>
  (problem, options) =>
    new PluginLoadError(url, `the answer ${problem}`, options)

/** Reads a response body, failing as soon as it grows larger than a plugin can be. */
const readLimitedBody = async (response: Response, url: string): Promise<Buffer> => {
  if (Number(response.headers.get('content-length')) > MAX_DOWNLOAD_BYTES) {
    await response.body?.cancel()
    throw tooLargeError(url)
  }
  const chunks: Uint8Array[] = []
  let size = 0
  for await (const chunk of response.body ?? []) {
    size += chunk.byteLength
    if (size > MAX_DOWNLOAD_BYTES) {
      throw tooLargeError(url)
    }
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}

/** The URL a redirect leads to; only https is followed, so no answer arrives unencrypted. */
const redirectTarget = (location: string, current: string, url: string): URL => {
  const next = new URL(location, current)
  if (next.protocol !== SECURE_PROTOCOL) {
    throw new PluginLoadError(url, `the download redirects to ${next.href}, which is not https`)
  }
  return next
}

/**
 * Downloads a URL. Headers such as access tokens go only to the origin they were meant for: a
 * redirect to another origin is followed without them.
 */
const downloadOrFail = async (
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
      const next = redirectTarget(location, current, url)
      if (next.origin !== new URL(current).origin) {
        currentHeaders = {}
      }
      current = next.href
      continue
    }
    if (!response.ok) {
      throw new PluginLoadError(url, `the download failed with HTTP ${response.status}`)
    }
    return readLimitedBody(response, url)
  }
  throw new PluginLoadError(url, 'the download redirected too often')
}

/** Downloads a URL; a network failure or timeout fails as a plugin that cannot be loaded. */
export const download = async (
  environment: RemoteEnvironment,
  request: DownloadRequest,
): Promise<Buffer> => {
  try {
    return await downloadOrFail(environment, request)
  } catch (error) {
    if (error instanceof PluginLoadError) {
      throw error
    }
    throw new PluginLoadError(request.url, 'the download failed', {
      cause: error,
    })
  }
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
