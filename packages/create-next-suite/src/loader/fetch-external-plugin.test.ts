import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import * as tar from 'tar'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { COMMIT_SHA, type Routes, stubRemote } from '../test-support/stub-remote.ts'
import { writeFiles } from '../test-support/write-files.ts'
import { type ExternalSources, fetchExternalPlugin } from './fetch-external-plugin.ts'

const PLUGIN = [
  "import { definePlugin } from 'create-next-suite/plugin'",
  '',
  "export default definePlugin({ name: 'mail', title: 'Mail', files: { 'mail.txt': 'files/mail.txt' } })",
  '',
].join('\n')
const MAIL_FILES = { 'plugin.ts': PLUGIN, 'files/mail.txt': 'mail\n' }

let root: string

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'next-suite-external-'))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

const sources = (routes: Routes = {}, registries = {}): ExternalSources => ({
  cwd: root,
  remote: stubRemote(root, routes),
  registries,
})

/** A gzipped tarball of files under one top directory, as npm, GitHub and GitLab serve them. */
const tarball = async (top: string, files: Readonly<Record<string, string>>) => {
  await writeFiles(join(root, 'tarball', top), files)
  const file = join(root, `${top}.tgz`)
  await tar.c({ gzip: true, file, cwd: join(root, 'tarball') }, [top])
  await rm(join(root, 'tarball'), { recursive: true, force: true })
  return new Uint8Array(await readFile(file))
}

const respond = (body: Uint8Array | string) => () => new Response(body)

describe('fetchExternalPlugin', () => {
  it('reads a local directory without running it and snapshots its files by content hash', async () => {
    await writeFiles(join(root, 'mail'), { ...MAIL_FILES, 'node_modules/x/index.js': '' })

    const fetched = await fetchExternalPlugin('./mail', sources())

    expect(fetched).toMatchObject({
      address: './mail',
      resolved: undefined,
      isLocal: true,
      summary: { metadata: { name: 'mail', title: 'Mail' } },
    })
    expect(fetched.contentHash).toMatch(/^sha256-[0-9a-f]{64}$/)
    expect(fetched.directory.startsWith(join(root, 'cache', 'snapshot'))).toBe(true)
    expect(await readFile(join(fetched.directory, 'files/mail.txt'), 'utf8')).toBe('mail\n')
    await expect(readFile(join(fetched.directory, 'node_modules/x/index.js'))).rejects.toThrow()
  })

  it('gives the same files the same content hash and changed files another one', async () => {
    await writeFiles(join(root, 'a'), MAIL_FILES)
    await writeFiles(join(root, 'b'), MAIL_FILES)
    const first = await fetchExternalPlugin('./a', sources())
    const same = await fetchExternalPlugin('./b', sources())
    await writeFiles(join(root, 'b'), { 'files/mail.txt': 'changed\n' })
    const changed = await fetchExternalPlugin('./b', sources())

    expect(same.contentHash).toBe(first.contentHash)
    expect(changed.contentHash).not.toBe(first.contentHash)
  })

  it('fetches a plugin from npm, checked against its integrity', async () => {
    const archive = await tarball('package', MAIL_FILES)
    const integrity = `sha512-${createHash('sha512').update(archive).digest('base64')}`
    const packument = {
      'dist-tags': { latest: '1.0.0' },
      versions: { '1.0.0': { dist: { tarball: 'https://t/mail-1.0.0.tgz', integrity } } },
    }

    const fetched = await fetchExternalPlugin(
      'npm:next-suite-mail',
      sources({
        'https://registry.npmjs.org/next-suite-mail': respond(JSON.stringify(packument)),
        'https://t/mail-1.0.0.tgz': respond(archive),
      }),
    )

    expect(fetched).toMatchObject({ resolved: `1.0.0 ${integrity}`, isLocal: false })
    expect(fetched.summary.metadata.name).toBe('mail')
  })

  it('fetches a directory of a GitHub repository at a commit', async () => {
    const archive = await tarball('acme-plugins-top', { 'mail/plugin.ts': PLUGIN })

    const fetched = await fetchExternalPlugin(
      'github:acme/plugins/mail#v1',
      sources({
        'https://api.github.com/repos/acme/plugins/commits/v1': respond(COMMIT_SHA),
        [`https://api.github.com/repos/acme/plugins/tarball/${COMMIT_SHA}`]: respond(archive),
      }),
    )

    expect(fetched).toMatchObject({ resolved: COMMIT_SHA, summary: { metadata: { name: 'mail' } } })
  })

  it('fetches a directory of a GitLab repository at a commit', async () => {
    const archive = await tarball('plugins-main', { 'mail/plugin.ts': PLUGIN })
    const project = 'https://gitlab.com/api/v4/projects/acme%2Fplugins'

    const fetched = await fetchExternalPlugin(
      'gitlab:acme/plugins/mail#main',
      sources({
        [`${project}/repository/commits/main`]: respond(JSON.stringify({ id: COMMIT_SHA })),
        [`${project}/repository/archive.tar.gz?sha=${COMMIT_SHA}`]: respond(archive),
      }),
    )

    expect(fetched).toMatchObject({ resolved: COMMIT_SHA, summary: { metadata: { name: 'mail' } } })
  })

  it('fetches a tarball URL over https and refuses plain http', async () => {
    const archive = await tarball('mail', MAIL_FILES)

    const fetched = await fetchExternalPlugin(
      'https://host/mail.tgz',
      sources({ 'https://host/mail.tgz': respond(archive) }),
    )

    expect(fetched.resolved).toMatch(/^sha256-/)
    expect(fetched.summary.metadata.name).toBe('mail')
    await expect(fetchExternalPlugin('http://host/mail.tgz', sources())).rejects.toThrow(
      'plugin addresses must use https',
    )
  })

  it('clones a Git repository and resolves its commit', async () => {
    const repository = join(root, 'repo')
    await writeFiles(repository, MAIL_FILES)
    const git = (...args: string[]) =>
      execFileSync('git', ['-C', repository, ...args], { encoding: 'utf8' }).trim()
    git('init', '--quiet', '--initial-branch', 'main')
    git('add', '.')
    git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '--quiet', '-m', 'init')

    const fetched = await fetchExternalPlugin(`git+file://${repository}#main`, sources())

    expect(fetched).toMatchObject({ resolved: git('rev-parse', 'HEAD') })
    expect(fetched.summary.metadata.name).toBe('mail')
  })

  it('loads a plugin of a registry by its short name', async () => {
    await writeFiles(join(root, 'registry'), {
      'registry.json': JSON.stringify({
        name: '@acme',
        plugins: [{ name: 'mail', path: 'plugins/mail', description: 'Mail.' }],
      }),
      'plugins/mail/plugin.ts': PLUGIN,
    })

    const fetched = await fetchExternalPlugin(
      '@acme/mail',
      sources({}, { '@acme': join(root, 'registry') }),
    )

    expect(fetched).toMatchObject({ address: '@acme/mail', isLocal: false })
    expect(fetched.summary.metadata.name).toBe('mail')
  })

  it('refuses a registry that places a plugin outside itself, by its path or a link', async () => {
    await writeFiles(root, { 'outside/plugin.ts': PLUGIN })
    await writeFiles(join(root, 'registry'), {
      'registry.json': JSON.stringify({
        name: '@acme',
        plugins: [
          { name: 'up', path: '../outside', description: 'Up.' },
          { name: 'linked', path: 'linked', description: 'Linked.' },
        ],
      }),
    })
    await symlink(join(root, 'outside'), join(root, 'registry', 'linked'))
    const registries = { '@acme': join(root, 'registry') }

    await expect(fetchExternalPlugin('@acme/up', sources({}, registries))).rejects.toThrow(
      'the registry places up outside itself',
    )
    await expect(fetchExternalPlugin('@acme/linked', sources({}, registries))).rejects.toThrow(
      'the registry places linked outside itself',
    )
    await expect(fetchExternalPlugin('@acme/none', sources({}, registries))).rejects.toThrow(
      'the registry @acme lists no plugin none',
    )
    await expect(fetchExternalPlugin('@other/mail', sources({}, registries))).rejects.toThrow(
      'the registry @other is unknown',
    )
  })

  it.each([
    ['mail', 'the address has no known form'],
    ['github:acme/plugins/../../x', 'the address has no known form'],
    ['github:acme/*', 'the address has no known form'],
    ['./missing', 'does not exist'],
  ])('refuses the address %s', async (address, message) => {
    await expect(fetchExternalPlugin(address, sources())).rejects.toThrow(message)
  })

  it('refuses a directory without plugin.ts, with a link, or with metadata that needs running', async () => {
    await writeFiles(root, {
      'empty/files/a.txt': '',
      'linked/plugin.ts': PLUGIN,
      'computed/plugin.ts': PLUGIN.replace("title: 'Mail'", 'title: TITLE'),
      'plain/plugin.ts': "export default { name: 'mail', title: 'Mail' }\n",
    })
    await symlink('/etc/passwd', join(root, 'linked', 'passwd'))

    await expect(fetchExternalPlugin('./empty', sources())).rejects.toThrow(
      'cannot load the plugin ./empty: no plugin.ts',
    )
    await expect(fetchExternalPlugin('./linked', sources())).rejects.toThrow(
      'passwd is a link or no regular file',
    )
    await expect(fetchExternalPlugin('./computed', sources())).rejects.toThrow(
      'cannot load the plugin ./computed: plugin.ts: title is no fixed value (found Identifier)',
    )
    await expect(fetchExternalPlugin('./plain', sources())).rejects.toThrow(
      'plugin.ts: its default export is no export default definePlugin',
    )
  })
})
