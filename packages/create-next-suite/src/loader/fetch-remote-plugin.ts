import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'

import semver from 'semver'
import * as tar from 'tar'
import * as z from 'zod'

import { isInsideOrSame } from '../file-system/is-inside.ts'
import { type JsonErrorFactory, parseJsonWith, parseWith } from '../file-system/read-json-file.ts'
import type { PluginAddress } from './plugin-address.ts'
import { PluginLoadError } from './plugin-load-error.ts'

const execFileAsync = promisify(execFile)

const DEFAULT_NPM_REGISTRY = 'https://registry.npmjs.org'
const GITHUB_API = 'https://api.github.com'
const GITLAB_API = 'https://gitlab.com/api/v4'

/** What fetching needs from outside: the network, the cache folder and access tokens. */
export type RemoteEnvironment = {
  fetch: typeof fetch
  cacheDir: string
  /** An access token for a host, such as from `GH_TOKEN` or the GitHub CLI. */
  tokenFor: (host: 'github' | 'gitlab') => string | undefined
  npmRegistry: string | undefined
}

/** A fetched plugin: its folder in the cache and what its source resolved to. */
export type FetchedPlugin = { folder: string; resolved: string }

type RemoteAddress = Exclude<PluginAddress, { kind: 'local' } | { kind: 'registry' }>

const DOWNLOAD_TIMEOUT_MS = 60_000
/** Far above any plugin, small enough that a hostile server cannot fill the disk. */
const MAX_DOWNLOAD_BYTES = 50 * 1024 * 1024
const COMMIT = /^[0-9a-f]{40}$/
const MAX_REDIRECTS = 5

const isRedirect = (status: number): boolean => status >= 300 && status < 400

/**
 * Downloads a URL. Headers such as access tokens go only to the origin they were meant for: a
 * redirect to another origin is followed without them.
 */
const download = async (
  environment: RemoteEnvironment,
  url: string,
  headers: Record<string, string> = {},
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

const answerError =
  (url: string): JsonErrorFactory =>
  (problem, options) =>
    new PluginLoadError(url, `the answer ${problem}`, options)

const getJson = async (
  environment: RemoteEnvironment,
  url: string,
  headers: Record<string, string> = {},
): Promise<unknown> => {
  const text = (await download(environment, url, headers)).toString('utf8')
  return parseJsonWith(text, z.unknown(), answerError(url))
}

/** Extracts a tarball into a folder, regular files and folders only, nothing outside it. */
const extract = async (archive: Buffer, target: string, strip: number): Promise<void> => {
  const scratch = await mkdtemp(join(tmpdir(), 'next-suite-archive-'))
  try {
    const file = join(scratch, 'archive.tgz')
    await writeFile(file, archive)
    await mkdir(target, { recursive: true })
    await tar.x({
      file,
      cwd: target,
      strip,
      filter: (_path, entry) =>
        'type' in entry && (entry.type === 'File' || entry.type === 'Directory'),
    })
  } finally {
    await rm(scratch, { recursive: true, force: true })
  }
}

/** The single top folder of an extracted archive, or the folder itself when it has more. */
const topFolder = async (folder: string): Promise<string> => {
  const entries = await readdir(folder, { withFileTypes: true })
  const [only] = entries
  return entries.length === 1 && only?.isDirectory() === true ? join(folder, only.name) : folder
}

/** The cache folder of a key: one folder per source kind, named by a hash of the whole key. */
const cacheFolder = (environment: RemoteEnvironment, kind: string, key: readonly string[]) =>
  join(
    environment.cacheDir,
    kind,
    createHash('sha256').update(JSON.stringify(key)).digest('hex').slice(0, CACHE_NAME_LENGTH),
  )

const CACHE_NAME_LENGTH = 32

/** Runs `fill` into a fresh folder and moves it into the cache, unless it is cached already. */
const cached = async (
  environment: RemoteEnvironment,
  [kind, ...key]: [string, ...string[]],
  fill: (folder: string) => Promise<void>,
): Promise<string> => {
  const folder = cacheFolder(environment, kind, key)
  if (existsSync(folder)) {
    return folder
  }
  const scratch = `${folder}.partial-${process.pid}`
  await rm(scratch, { recursive: true, force: true })
  await mkdir(join(folder, '..'), { recursive: true })
  try {
    await fill(scratch)
    await rename(scratch, folder)
  } catch (error) {
    await rm(scratch, { recursive: true, force: true })
    if (existsSync(folder)) {
      return folder
    }
    throw error
  }
  return folder
}

/** Fails when a folder in a repository lies outside it. */
const insideRepository = (root: string, path: string, address: string): string => {
  const folder = resolve(root, path)
  if (!isInsideOrSame(root, folder)) {
    throw new PluginLoadError(address, 'the folder lies outside the repository')
  }
  return folder
}

const packumentSchema = z.object({
  'dist-tags': z.record(z.string(), z.string()),
  versions: z.record(z.string(), z.unknown()),
})
const versionSchema = z.object({ dist: z.object({ tarball: z.string(), integrity: z.string() }) })

const fetchNpm = async (
  environment: RemoteEnvironment,
  { name, range }: Extract<RemoteAddress, { kind: 'npm' }>,
): Promise<FetchedPlugin> => {
  const registry = (environment.npmRegistry ?? DEFAULT_NPM_REGISTRY).replace(/\/$/, '')
  const url = `${registry}/${name.replace('/', '%2f')}`
  const packument = parseWith(await getJson(environment, url), packumentSchema, answerError(url))
  const version =
    packument['dist-tags'][range] ?? semver.maxSatisfying(Object.keys(packument.versions), range)
  if (version === null || version === undefined) {
    throw new PluginLoadError(`npm:${name}`, `no version matches ${range}`)
  }
  const { dist } = parseWith(packument.versions[version], versionSchema, answerError(url))
  const [algorithm, expected] = dist.integrity.split('-', 2)
  if (algorithm !== 'sha512' || expected === undefined) {
    throw new PluginLoadError(`npm:${name}@${version}`, 'the package has no sha512 integrity')
  }
  const folder = await cached(
    environment,
    ['npm', name, version, dist.integrity],
    async (target) => {
      const archive = await download(environment, dist.tarball)
      const actual = createHash(algorithm).update(archive).digest('base64')
      if (actual !== expected) {
        throw new PluginLoadError(
          `npm:${name}@${version}`,
          'the tarball does not match its integrity',
        )
      }
      await extract(archive, target, 1)
    },
  )
  return { folder, resolved: `${version} ${dist.integrity}` }
}

const githubHeaders = (environment: RemoteEnvironment) => {
  const token = environment.tokenFor('github')
  return token === undefined ? {} : { authorization: `Bearer ${token}` }
}

const fetchGithub = async (
  environment: RemoteEnvironment,
  { owner, repo, path, ref }: Extract<RemoteAddress, { kind: 'github' }>,
): Promise<FetchedPlugin> => {
  const headers = githubHeaders(environment)
  const commits = `${GITHUB_API}/repos/${owner}/${repo}/commits/${encodeURIComponent(ref ?? 'HEAD')}`
  const sha = (
    await download(environment, commits, { ...headers, accept: 'application/vnd.github.sha' })
  )
    .toString('utf8')
    .trim()
  if (!COMMIT.test(sha)) {
    throw new PluginLoadError(commits, 'GitHub answered no commit')
  }
  const root = await cached(environment, ['github', owner, repo, sha], async (target) => {
    await extract(
      await download(environment, `${GITHUB_API}/repos/${owner}/${repo}/tarball/${sha}`, headers),
      target,
      1,
    )
  })
  return { folder: insideRepository(root, path, `github:${owner}/${repo}`), resolved: sha }
}

// biome-ignore lint/style/useNamingConvention: the GitLab API names this field
const gitlabProjectSchema = z.object({ default_branch: z.string() })
const gitlabCommitSchema = z.object({ id: z.string() })

const fetchGitlab = async (
  environment: RemoteEnvironment,
  { owner, repo, path, ref }: Extract<RemoteAddress, { kind: 'gitlab' }>,
): Promise<FetchedPlugin> => {
  const token = environment.tokenFor('gitlab')
  const headers = token === undefined ? {} : { 'private-token': token }
  const project = `${GITLAB_API}/projects/${encodeURIComponent(`${owner}/${repo}`)}`
  const branch =
    ref ?? gitlabProjectSchema.parse(await getJson(environment, project, headers)).default_branch
  const { id } = gitlabCommitSchema.parse(
    await getJson(
      environment,
      `${project}/repository/commits/${encodeURIComponent(branch)}`,
      headers,
    ),
  )
  const root = await cached(environment, ['gitlab', owner, repo, id], async (target) => {
    await extract(
      await download(environment, `${project}/repository/archive.tar.gz?sha=${id}`, headers),
      target,
      1,
    )
  })
  return { folder: insideRepository(root, path, `gitlab:${owner}/${repo}`), resolved: id }
}

const fetchUrl = async (
  environment: RemoteEnvironment,
  { url }: Extract<RemoteAddress, { kind: 'url' }>,
): Promise<FetchedPlugin> => {
  const archive = await download(environment, url)
  const digest = createHash('sha256').update(archive).digest('hex')
  const folder = await cached(environment, ['url', digest], (target) => extract(archive, target, 0))
  return { folder: await topFolder(folder), resolved: `sha256-${digest}` }
}

/** Git options that keep a clone from running anything or asking for a password. */
const GIT_HARDENING = [
  '-c',
  'core.symlinks=false',
  '-c',
  'protocol.allow=never',
  '-c',
  'protocol.https.allow=always',
  '-c',
  'protocol.ssh.allow=always',
  '-c',
  'protocol.file.allow=always',
]

const git = (args: string[]) =>
  execFileAsync('git', [...GIT_HARDENING, ...args], {
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  })

/** Clones the ref of a repository into a folder: a branch or tag directly, a commit by fetching it. */
const cloneInto = async (url: string, ref: string | undefined, folder: string) => {
  if (ref !== undefined && COMMIT.test(ref)) {
    await git(['init', '--quiet', folder])
    await git(['-C', folder, 'fetch', '--quiet', '--depth', '1', '--', url, ref])
    await git(['-C', folder, 'checkout', '--quiet', 'FETCH_HEAD'])
    return
  }
  await git([
    'clone',
    '--quiet',
    '--depth',
    '1',
    ...(ref === undefined ? [] : ['--branch', ref]),
    '--',
    url,
    folder,
  ])
}

const fetchGit = async (
  environment: RemoteEnvironment,
  { url, ref }: Extract<RemoteAddress, { kind: 'git' }>,
): Promise<FetchedPlugin> => {
  await mkdir(environment.cacheDir, { recursive: true })
  const scratch = await mkdtemp(join(environment.cacheDir, '.clone-'))
  try {
    const clone = join(scratch, 'clone')
    await cloneInto(url, ref, clone)
    const { stdout } = await git(['-C', clone, 'rev-parse', 'HEAD'])
    const sha = stdout.trim()
    await rm(join(clone, '.git'), { recursive: true, force: true })
    const folder = await cached(environment, ['git', url, sha], (target) => rename(clone, target))
    return { folder, resolved: sha }
  } catch (error) {
    throw error instanceof PluginLoadError
      ? error
      : new PluginLoadError(url, 'cloning the repository failed', { cause: error })
  } finally {
    await rm(scratch, { recursive: true, force: true })
  }
}

/**
 * Fetches a plugin from npm, GitHub, GitLab, any Git repository or a tarball URL into the cache,
 * one folder per source and resolved version or commit, and answers that folder. npm tarballs are
 * checked against their integrity; no install script ever runs.
 */
export const fetchRemotePlugin = async (
  environment: RemoteEnvironment,
  address: RemoteAddress,
): Promise<FetchedPlugin> => {
  switch (address.kind) {
    case 'npm':
      return fetchNpm(environment, address)
    case 'github':
      return fetchGithub(environment, address)
    case 'gitlab':
      return fetchGitlab(environment, address)
    case 'url':
      return fetchUrl(environment, address)
    case 'git':
      return fetchGit(environment, address)
  }
}
