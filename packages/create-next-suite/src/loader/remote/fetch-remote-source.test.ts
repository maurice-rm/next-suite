import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import * as tar from 'tar'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { stubRemote } from '../../test-support/stub-remote.ts'
import { writeFiles } from '../../test-support/write-files.ts'
import { PluginLoadError } from '../plugin-load-error.ts'
import { fetchRemoteSource } from './fetch-remote-source.ts'
import type { RemoteEnvironment } from './remote-source.ts'

let root: string

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'next-suite-fetch-'))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

/** A gzipped tarball of files under one top directory, as npm and GitHub serve them. */
const tarball = async (top: string, files: Record<string, string>): Promise<Buffer> => {
  const source = join(root, 'source', top)
  await writeFiles(source, files)
  const file = join(root, `${top}.tgz`)
  await tar.c({ gzip: true, file, cwd: join(root, 'source') }, [top])
  await rm(join(root, 'source'), { recursive: true, force: true })
  return readFile(file)
}

const respond = (body: Buffer | string, status = 200) =>
  new Response(typeof body === 'string' ? body : new Uint8Array(body), { status })

const PLUGIN = '{"name":"mail"}'

describe('fetchRemoteSource', () => {
  it('fetches an npm package, picks the version of the range and checks its integrity', async () => {
    const archive = await tarball('package', { 'plugin.json': PLUGIN })
    const integrity = `sha512-${createHash('sha512').update(archive).digest('base64')}`
    const environment = stubRemote(root, {
      'https://registry.npmjs.org/@acme%2fmail': () =>
        respond(
          JSON.stringify({
            'dist-tags': { latest: '1.2.0' },
            versions: {
              '1.1.0': { dist: { tarball: 'https://t/1.1.0.tgz', integrity: 'sha512-x' } },
              '1.2.0': { dist: { tarball: 'https://t/1.2.0.tgz', integrity } },
            },
          }),
        ),
      'https://t/1.2.0.tgz': () => respond(archive),
    })

    const fetched = await fetchRemoteSource(environment, {
      kind: 'npm',
      name: '@acme/mail',
      range: '^1',
    })

    expect(fetched.resolved).toBe(`1.2.0 ${integrity}`)
    expect(await readFile(join(fetched.directory, 'plugin.json'), 'utf8')).toBe(PLUGIN)
  })

  it('accepts an integrity with several hashes when the sha512 one matches', async () => {
    const archive = await tarball('package', { 'plugin.json': PLUGIN })
    const sha512 = createHash('sha512').update(archive).digest('base64')
    const integrity = `sha512-${sha512} sha1-AAAA`
    const environment = stubRemote(root, {
      'https://registry.npmjs.org/mail': () =>
        respond(
          JSON.stringify({
            'dist-tags': { latest: '1.0.0' },
            versions: { '1.0.0': { dist: { tarball: 'https://t/1.0.0.tgz', integrity } } },
          }),
        ),
      'https://t/1.0.0.tgz': () => respond(archive),
    })

    const fetched = await fetchRemoteSource(environment, {
      kind: 'npm',
      name: 'mail',
      range: 'latest',
    })

    expect(await readFile(join(fetched.directory, 'plugin.json'), 'utf8')).toBe(PLUGIN)
  })

  it('rejects an npm tarball that does not match its integrity', async () => {
    const environment = stubRemote(root, {
      'https://registry.npmjs.org/mail': () =>
        respond(
          JSON.stringify({
            'dist-tags': { latest: '1.0.0' },
            versions: {
              '1.0.0': { dist: { tarball: 'https://t/x.tgz', integrity: 'sha512-AAAA' } },
            },
          }),
        ),
      'https://t/x.tgz': () => respond(Buffer.from('tampered')),
    })

    await expect(
      fetchRemoteSource(environment, { kind: 'npm', name: 'mail', range: 'latest' }),
    ).rejects.toThrow('does not match its integrity')
  })

  it('fetches a directory of a GitHub repository at the commit its ref resolves to', async () => {
    const archive = await tarball('acme-plugins-top', { 'mail/plugin.json': PLUGIN })
    const environment = stubRemote(root, {
      'https://api.github.com/repos/acme/plugins/commits/v2': () =>
        respond('0123456789abcdef0123456789abcdef01234567\n'),
      'https://api.github.com/repos/acme/plugins/tarball/0123456789abcdef0123456789abcdef01234567':
        () => respond(archive),
    })

    const fetched = await fetchRemoteSource(environment, {
      kind: 'github',
      owner: 'acme',
      repo: 'plugins',
      path: 'mail',
      ref: 'v2',
    })

    expect(fetched.resolved).toBe('0123456789abcdef0123456789abcdef01234567')
    expect(await readFile(join(fetched.directory, 'plugin.json'), 'utf8')).toBe(PLUGIN)
  })

  it('rejects a GitLab answer that names no commit', async () => {
    const project = 'https://gitlab.com/api/v4/projects/acme%2Fplugins'
    const environment = stubRemote(root, {
      [`${project}/repository/commits/main`]: () => respond(JSON.stringify({ id: '../../x' })),
    })

    const fetching = fetchRemoteSource(environment, {
      kind: 'gitlab',
      owner: 'acme',
      repo: 'plugins',
      path: '',
      ref: 'main',
    })

    await expect(fetching).rejects.toThrow(PluginLoadError)
    await expect(fetching).rejects.toThrow('GitLab answered no commit')
  })

  it('names an invalid GitLab answer instead of failing with a raw schema error', async () => {
    const environment = stubRemote(root, {
      'https://gitlab.com/api/v4/projects/acme%2Fplugins': () => respond('{}'),
    })

    const fetching = fetchRemoteSource(environment, {
      kind: 'gitlab',
      owner: 'acme',
      repo: 'plugins',
      path: '',
      ref: undefined,
    })

    await expect(fetching).rejects.toThrow(PluginLoadError)
    await expect(fetching).rejects.toThrow('the answer is invalid')
  })

  it('fetches a tarball URL and names it by its digest', async () => {
    const archive = await tarball('mail', { 'plugin.json': PLUGIN })
    const environment = stubRemote(root, { 'https://host/mail.tgz': () => respond(archive) })

    const fetched = await fetchRemoteSource(environment, {
      kind: 'url',
      url: 'https://host/mail.tgz',
    })

    expect(fetched.resolved).toMatch(/^sha256-[0-9a-f]{64}$/)
    expect(await readFile(join(fetched.directory, 'plugin.json'), 'utf8')).toBe(PLUGIN)
  })

  it('clones a Git repository and resolves its commit', async () => {
    const repository = join(root, 'repo')
    await mkdir(repository)
    await writeFile(join(repository, 'plugin.json'), PLUGIN)
    const git = (...args: string[]) =>
      execFileSync('git', ['-C', repository, ...args], { encoding: 'utf8' }).trim()
    git('init', '--quiet', '--initial-branch', 'main')
    git('add', '.')
    git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '--quiet', '-m', 'init')

    const fetched = await fetchRemoteSource(stubRemote(root), {
      kind: 'git',
      url: `file://${repository}`,
      ref: 'main',
    })

    expect(fetched.resolved).toBe(git('rev-parse', 'HEAD'))
    expect(await readFile(join(fetched.directory, 'plugin.json'), 'utf8')).toBe(PLUGIN)
  })

  it('sends a token only to the origin it was meant for, not after a redirect elsewhere', async () => {
    const archive = await tarball('top', { 'plugin.json': PLUGIN })
    const sha = '0123456789abcdef0123456789abcdef01234567'
    const seen: Record<string, string | null> = {}
    const environment: RemoteEnvironment = {
      ...stubRemote(root),
      tokenFor: () => 'secret',
      fetch: async (input, init) => {
        const url = String(input)
        seen[url] = new Headers(init?.headers).get('authorization')
        if (url.endsWith('/commits/HEAD')) {
          return respond(sha)
        }
        if (url.endsWith(`/tarball/${sha}`)) {
          return new Response(null, {
            status: 302,
            headers: { location: 'https://codeload.example/t.tgz' },
          })
        }
        return respond(archive)
      },
    }

    await fetchRemoteSource(environment, {
      kind: 'github',
      owner: 'acme',
      repo: 'p',
      path: '',
      ref: undefined,
    })

    expect(seen[`https://api.github.com/repos/acme/p/tarball/${sha}`]).toBe('Bearer secret')
    expect(seen['https://codeload.example/t.tgz']).toBeNull()
  })

  it('clones a Git repository at a commit', async () => {
    const repository = join(root, 'repo')
    await mkdir(repository)
    await writeFile(join(repository, 'plugin.json'), PLUGIN)
    const git = (...args: string[]) =>
      execFileSync('git', ['-C', repository, ...args], { encoding: 'utf8' }).trim()
    git('init', '--quiet', '--initial-branch', 'main')
    git('add', '.')
    git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '--quiet', '-m', 'init')
    git('config', 'uploadpack.allowReachableSHA1InWant', 'true')
    const sha = git('rev-parse', 'HEAD')

    const fetched = await fetchRemoteSource(stubRemote(root), {
      kind: 'git',
      url: `file://${repository}`,
      ref: sha,
    })

    expect(fetched.resolved).toBe(sha)
  })
})
