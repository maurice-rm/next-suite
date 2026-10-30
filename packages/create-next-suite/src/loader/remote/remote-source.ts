import type { PluginAddress } from '../plugin-address.ts'

/** What fetching needs from outside: the network, the cache directory and access tokens. */
export type RemoteEnvironment = {
  fetch: typeof fetch
  cacheDir: string
  /** An access token for a host, such as from `GH_TOKEN` or the GitHub CLI. */
  tokenFor: (host: 'github' | 'gitlab') => string | undefined
  npmRegistry: string | undefined
}

/** An address of a source outside this machine: npm, GitHub, GitLab, Git or a tarball URL. */
export type RemoteAddress = Exclude<PluginAddress, { kind: 'local' } | { kind: 'registry' }>

/** A fetched source: its directory in the cache and what its address resolved to. */
export type FetchedSource = { directory: string; resolved: string }
