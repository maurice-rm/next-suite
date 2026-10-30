import { isAbsolute } from 'node:path'

import { REGISTRY_PLUGIN_ADDRESS } from '../contract/identifiers.ts'

/** A repository on GitHub or GitLab, a directory in it and the ref to take. */
type HostedRepository = { owner: string; repo: string; path: string; ref: string | undefined }

/**
 * Where an external plugin comes from, parsed from the address a user passes: a local directory, an
 * npm package, a GitHub or GitLab repository, any Git repository, a tarball URL, or a plugin of a
 * registry by its short name.
 */
export type PluginAddress =
  | { kind: 'local'; path: string }
  | { kind: 'npm'; name: string; range: string }
  | ({ kind: 'github' } & HostedRepository)
  | ({ kind: 'gitlab' } & HostedRepository)
  | { kind: 'git'; url: string; ref: string | undefined }
  | { kind: 'url'; url: string }
  | { kind: 'registry'; registry: string; name: string }

const NPM = /^npm:((?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*)(?:@(.+))?$/
const HOSTED = /^(github|gitlab):([^/#\s]+)\/([^/#\s]+)((?:\/[^#\s]+)?)(?:#(\S+))?$/
const GIT = /^git\+(\S+?)(?:#(\S+))?$/
const URL_ADDRESS = /^https?:\/\/\S+$/
const NAME_PART = /^[A-Za-z0-9_.-]+$/
const LOCAL_PREFIXES = ['./', '../', '.\\', '..\\']
/** The npm dist-tag an address without a version range takes. */
const LATEST_TAG = 'latest'

const isLocal = (address: string): boolean =>
  address === '.' ||
  address === '..' ||
  isAbsolute(address) ||
  LOCAL_PREFIXES.some((prefix) => address.startsWith(prefix))

const isNamePart = (part: string): boolean => NAME_PART.test(part) && part !== '.' && part !== '..'
const isDirectoryPath = (path: string): boolean =>
  path === '' || path.split('/').every((segment) => segment !== '' && isNamePart(segment))

/**
 * A GitHub or GitLab address, or nothing when it is none or names a path outside the repository.
 */
const parseHosted = (address: string): PluginAddress | undefined => {
  const [, host, owner, repo, path, ref] = HOSTED.exec(address) ?? []
  if (host === undefined || owner === undefined || repo === undefined) {
    return undefined
  }
  const repository: HostedRepository = {
    owner,
    repo,
    path: (path ?? '').replace(/^\//, ''),
    ref,
  }
  if (!isNamePart(owner) || !isNamePart(repo) || !isDirectoryPath(repository.path)) {
    return undefined
  }
  return host === 'github' ? { kind: 'github', ...repository } : { kind: 'gitlab', ...repository }
}

/**
 * Parses a plugin address; an address of no known form answers nothing, and so does one with a
 * `*`, which would turn into a wildcard once trusted, or a repository path with `..`.
 */
export const parsePluginAddress = (address: string): PluginAddress | undefined => {
  if (address.includes('*')) {
    return undefined
  }
  if (isLocal(address)) {
    return { kind: 'local', path: address }
  }
  const npm = NPM.exec(address)
  if (npm?.[1] !== undefined) {
    return { kind: 'npm', name: npm[1], range: npm[2] ?? LATEST_TAG }
  }
  const hosted = parseHosted(address)
  if (hosted !== undefined) {
    return hosted
  }
  const git = GIT.exec(address)
  if (git?.[1] !== undefined) {
    return { kind: 'git', url: git[1], ref: git[2] }
  }
  if (URL_ADDRESS.test(address)) {
    return { kind: 'url', url: address }
  }
  const registry = REGISTRY_PLUGIN_ADDRESS.exec(address)
  if (registry?.[1] !== undefined && registry[2] !== undefined) {
    return { kind: 'registry', registry: registry[1], name: registry[2] }
  }
  return undefined
}
