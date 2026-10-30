import { createHash } from 'node:crypto'
import { readdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'

import semver from 'semver'
import * as z from 'zod'

import { isInsideOrSame } from '../../file-system/is-inside.ts'
import { parseWith } from '../../file-system/read-json-file.ts'
import { PluginLoadError } from '../plugin-load-error.ts'
import { fillCacheOnce } from './cache.ts'
import { COMMIT_ID } from './commit-id.ts'
import { download, downloadJson, invalidAnswerError } from './download.ts'
import { extractTarball } from './extract-tarball.ts'
import { fetchGitSource } from './git.ts'
import type { FetchedSource, RemoteAddress, RemoteEnvironment } from './remote-source.ts'

const DEFAULT_NPM_REGISTRY = 'https://registry.npmjs.org'
const GITHUB_API = 'https://api.github.com'
const GITLAB_API = 'https://gitlab.com/api/v4'
const DEFAULT_REF = 'HEAD'
const REQUIRED_INTEGRITY_ALGORITHM = 'sha512'
/** npm, GitHub and GitLab wrap the files of a tarball in one top directory. */
const WRAPPED = 1
const UNWRAPPED = 0

const packumentSchema = z.object({
  'dist-tags': z.record(z.string(), z.string()),
  versions: z.record(z.string(), z.unknown()),
})
const packageVersionSchema = z.object({
  dist: z.object({ tarball: z.string(), integrity: z.string() }),
})
// biome-ignore lint/style/useNamingConvention: the GitLab API names this field
const gitlabProjectSchema = z.object({ default_branch: z.string() })
const gitlabCommitSchema = z.object({ id: z.string() })

type AddressOf<Kind extends RemoteAddress['kind']> = Extract<RemoteAddress, { kind: Kind }>

/** The single top directory of an extracted archive, or the directory itself when it has more. */
const unwrapSingleDirectory = async (directory: string): Promise<string> => {
  const entries = await readdir(directory, { withFileTypes: true })
  const [only] = entries
  return entries.length === 1 && only?.isDirectory() === true
    ? join(directory, only.name)
    : directory
}

/** The directory of a path in a repository; it fails for a path outside the repository. */
const resolveRepositoryDirectory = (root: string, path: string, address: string): string => {
  const directory = resolve(root, path)
  if (!isInsideOrSame(root, directory)) {
    throw new PluginLoadError(address, 'the directory lies outside the repository')
  }
  return directory
}

const fetchNpm = async (
  environment: RemoteEnvironment,
  { name, range }: AddressOf<'npm'>,
): Promise<FetchedSource> => {
  const registry = (environment.npmRegistry ?? DEFAULT_NPM_REGISTRY).replace(/\/$/, '')
  const url = `${registry}/${name.replace('/', '%2f')}`
  const packument = await downloadJson(environment, { url }, packumentSchema)
  const version =
    packument['dist-tags'][range] ?? semver.maxSatisfying(Object.keys(packument.versions), range)
  if (version === null || version === undefined) {
    throw new PluginLoadError(`npm:${name}`, `no version matches ${range}`)
  }
  const { dist } = parseWith(
    packument.versions[version],
    packageVersionSchema,
    invalidAnswerError(url),
  )
  const [algorithm, expected] = dist.integrity.split('-', 2)
  if (algorithm !== REQUIRED_INTEGRITY_ALGORITHM || expected === undefined) {
    throw new PluginLoadError(
      `npm:${name}@${version}`,
      `the package has no ${REQUIRED_INTEGRITY_ALGORITHM} integrity`,
    )
  }
  const directory = await fillCacheOnce(
    environment.cacheDir,
    ['npm', name, version, dist.integrity],
    async (target) => {
      const archive = await download(environment, { url: dist.tarball })
      const actual = createHash(algorithm).update(archive).digest('base64')
      if (actual !== expected) {
        throw new PluginLoadError(
          `npm:${name}@${version}`,
          'the tarball does not match its integrity',
        )
      }
      await extractTarball(archive, target, WRAPPED)
    },
  )
  return { directory, resolved: `${version} ${dist.integrity}` }
}

const githubHeaders = (environment: RemoteEnvironment): Record<string, string> => {
  const token = environment.tokenFor('github')
  return token === undefined ? {} : { authorization: `Bearer ${token}` }
}

const gitlabHeaders = (environment: RemoteEnvironment): Record<string, string> => {
  const token = environment.tokenFor('gitlab')
  return token === undefined ? {} : { 'private-token': token }
}

const fetchGithub = async (
  environment: RemoteEnvironment,
  { owner, repo, path, ref }: AddressOf<'github'>,
): Promise<FetchedSource> => {
  const headers = githubHeaders(environment)
  const repository = `${GITHUB_API}/repos/${owner}/${repo}`
  const commits = `${repository}/commits/${encodeURIComponent(ref ?? DEFAULT_REF)}`
  const commit = (
    await download(environment, {
      url: commits,
      headers: { ...headers, accept: 'application/vnd.github.sha' },
    })
  )
    .toString('utf8')
    .trim()
  if (!COMMIT_ID.test(commit)) {
    throw new PluginLoadError(commits, 'GitHub answered no commit')
  }
  const root = await fillCacheOnce(
    environment.cacheDir,
    ['github', owner, repo, commit],
    async (target) => {
      const archive = await download(environment, {
        url: `${repository}/tarball/${commit}`,
        headers,
      })
      await extractTarball(archive, target, WRAPPED)
    },
  )
  return {
    directory: resolveRepositoryDirectory(root, path, `github:${owner}/${repo}`),
    resolved: commit,
  }
}

const fetchGitlab = async (
  environment: RemoteEnvironment,
  { owner, repo, path, ref }: AddressOf<'gitlab'>,
): Promise<FetchedSource> => {
  const headers = gitlabHeaders(environment)
  const project = `${GITLAB_API}/projects/${encodeURIComponent(`${owner}/${repo}`)}`
  const branch =
    ref ??
    gitlabProjectSchema.parse(
      await downloadJson(environment, { url: project, headers }, z.unknown()),
    ).default_branch
  const { id } = gitlabCommitSchema.parse(
    await downloadJson(
      environment,
      { url: `${project}/repository/commits/${encodeURIComponent(branch)}`, headers },
      z.unknown(),
    ),
  )
  const root = await fillCacheOnce(
    environment.cacheDir,
    ['gitlab', owner, repo, id],
    async (target) => {
      const archive = await download(environment, {
        url: `${project}/repository/archive.tar.gz?sha=${id}`,
        headers,
      })
      await extractTarball(archive, target, WRAPPED)
    },
  )
  return {
    directory: resolveRepositoryDirectory(root, path, `gitlab:${owner}/${repo}`),
    resolved: id,
  }
}

const fetchUrl = async (
  environment: RemoteEnvironment,
  { url }: AddressOf<'url'>,
): Promise<FetchedSource> => {
  const archive = await download(environment, { url })
  const digest = createHash('sha256').update(archive).digest('hex')
  const directory = await fillCacheOnce(environment.cacheDir, ['url', digest], (target) =>
    extractTarball(archive, target, UNWRAPPED),
  )
  return { directory: await unwrapSingleDirectory(directory), resolved: `sha256-${digest}` }
}

/**
 * Fetches a source from npm, GitHub, GitLab, any Git repository or a tarball URL into the cache,
 * one directory per source and resolved version or commit, and answers that directory. npm
 * tarballs are checked against their integrity; no install script ever runs.
 */
export const fetchRemoteSource = async (
  environment: RemoteEnvironment,
  address: RemoteAddress,
): Promise<FetchedSource> => {
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
      return fetchGitSource(environment, address)
  }
}
