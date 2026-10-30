import { describe, expect, it } from 'vitest'

import { stubRemote } from '../../test-support/stub-remote.ts'
import { PluginLoadError } from '../plugin-load-error.ts'
import { download } from './download.ts'
import type { RemoteEnvironment } from './remote-source.ts'

const URL = 'https://host/plugin.tgz'
const MEBIBYTE = 1024 * 1024
const OVER_THE_LIMIT_MEBIBYTES = 60

const answering = (respond: (url: string) => Response | Promise<Response>): RemoteEnvironment => ({
  ...stubRemote('/unused'),
  fetch: async (input) => respond(String(input)),
})

/** A body of one-mebibyte chunks that counts how many of them were read. */
const countedBody = (chunks: number) => {
  const chunk = new Uint8Array(MEBIBYTE)
  let pulled = 0
  const stream = new ReadableStream<Uint8Array>({
    pull: (controller) => {
      pulled += 1
      if (pulled > chunks) {
        controller.close()
        return
      }
      controller.enqueue(chunk)
    },
  })
  return { stream, pulled: () => pulled }
}

describe('download', () => {
  it('reports a network failure as a plugin that cannot be loaded', async () => {
    const environment = answering(() => {
      throw new TypeError('fetch failed')
    })

    const failure = download(environment, { url: URL })

    await expect(failure).rejects.toThrow(PluginLoadError)
    await expect(failure).rejects.toThrow('the download failed')
  })

  it('reports a body that breaks off as a plugin that cannot be loaded', async () => {
    const stream = new ReadableStream({
      pull: (controller) => controller.error(new TypeError('terminated')),
    })

    await expect(
      download(
        answering(() => new Response(stream)),
        { url: URL },
      ),
    ).rejects.toThrow(PluginLoadError)
  })

  it('refuses a redirect to a URL that is not https', async () => {
    const requested: string[] = []
    const environment = answering((url) => {
      requested.push(url)
      return new Response(null, { status: 302, headers: { location: 'http://host/plugin.tgz' } })
    })

    await expect(download(environment, { url: URL })).rejects.toThrow('not https')
    expect(requested).toEqual([URL])
  })

  it('rejects a body that announces more than a plugin can be before reading it', async () => {
    const body = countedBody(1)
    const environment = answering(
      () =>
        new Response(body.stream, {
          headers: { 'content-length': String(OVER_THE_LIMIT_MEBIBYTES * MEBIBYTE) },
        }),
    )

    await expect(download(environment, { url: URL })).rejects.toThrow('larger than a plugin can be')
    expect(body.pulled()).toBeLessThanOrEqual(1)
  })

  it('stops reading a body once it grows larger than a plugin can be', async () => {
    const body = countedBody(OVER_THE_LIMIT_MEBIBYTES)

    await expect(
      download(
        answering(() => new Response(body.stream)),
        { url: URL },
      ),
    ).rejects.toThrow('larger than a plugin can be')
    expect(body.pulled()).toBeLessThan(OVER_THE_LIMIT_MEBIBYTES)
  })
})
