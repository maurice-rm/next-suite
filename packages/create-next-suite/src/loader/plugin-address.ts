import { isAbsolute } from 'node:path'

/**
 * Where an external plugin comes from, parsed from the address a user passes: a local folder, an
 * npm package, a GitHub or GitLab repository, any Git repository, a tarball URL, or a plugin of a
 * registry by its short name.
 */
export type PluginAddress =
  | { kind: 'local'; path: string }
  | { kind: 'npm'; name: string; range: string }
  | {
      kind: 'github' | 'gitlab'
      owner: string
      repo: string
      path: string
      ref: string | undefined
    }
  | { kind: 'git'; url: string; ref: string | undefined }
  | { kind: 'url'; url: string }
  | { kind: 'registry'; registry: string; name: string }

const NPM = /^npm:((?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*)(?:@(.+))?$/
const HOSTED = /^(github|gitlab):([^/#\s]+)\/([^/#\s]+)((?:\/[^#\s]+)?)(?:#(\S+))?$/
const GIT = /^git\+(\S+?)(?:#(\S+))?$/
const URL_ADDRESS = /^https?:\/\/\S+$/
const REGISTRY = /^(@[a-z0-9][a-z0-9-]*)\/([a-z0-9][a-z0-9-]*)$/
const LOCAL_PREFIXES = ['./', '../', '.\\', '..\\']
const ANY_VERSION = 'latest'

const isLocal = (address: string): boolean =>
  address === '.' ||
  address === '..' ||
  isAbsolute(address) ||
  LOCAL_PREFIXES.some((prefix) => address.startsWith(prefix))

/** Parses a plugin address; an address of no known form answers nothing. */
export const parsePluginAddress = (address: string): PluginAddress | undefined => {
  if (isLocal(address)) {
    return { kind: 'local', path: address }
  }
  const npm = NPM.exec(address)
  if (npm?.[1] !== undefined) {
    return { kind: 'npm', name: npm[1], range: npm[2] ?? ANY_VERSION }
  }
  const hosted = HOSTED.exec(address)
  if (hosted?.[1] !== undefined && hosted[2] !== undefined && hosted[3] !== undefined) {
    return {
      kind: hosted[1] === 'github' ? 'github' : 'gitlab',
      owner: hosted[2],
      repo: hosted[3],
      path: (hosted[4] ?? '').replace(/^\//, ''),
      ref: hosted[5],
    }
  }
  const git = GIT.exec(address)
  if (git?.[1] !== undefined) {
    return { kind: 'git', url: git[1], ref: git[2] }
  }
  if (URL_ADDRESS.test(address)) {
    return { kind: 'url', url: address }
  }
  const registry = REGISTRY.exec(address)
  if (registry?.[1] !== undefined && registry[2] !== undefined) {
    return { kind: 'registry', registry: registry[1], name: registry[2] }
  }
  return undefined
}
