import { matchesTrustPattern, sourceOf } from './trust-pattern.ts'

/** A plugin as trust sees it: its address, the hash of its files and whether it is local. */
type TrustSubject = { address: string; contentHash: string; isLocal: boolean }

/**
 * What the user trusts: patterns kept in the user configuration, patterns for this run only, and
 * the content hashes trusted for each source.
 */
type TrustState = {
  patterns: readonly string[]
  flagPatterns: readonly string[]
  trustedContent: Readonly<Record<string, readonly string[]>>
}

/**
 * Whether a plugin may run: trusted, where `recordsContent` says to add its content hash to those
 * trusted for its source; changed from the content last trusted; or from an unknown source.
 */
export type TrustVerdict =
  | { kind: 'trusted'; recordsContent: boolean }
  | { kind: 'changed'; trustedHash: string }
  | { kind: 'unknown' }

/**
 * Judges whether a plugin may run its code. A local directory the user names is trusted by
 * nature, and so is a source `--trust` covers for this run. A source the user configuration
 * trusts runs with a content trusted before, under any ref or version; its first content is
 * recorded, and any other content has to be confirmed. Any other source is unknown.
 */
export const judgeTrust = (plugin: TrustSubject, state: TrustState): TrustVerdict => {
  const matches = (pattern: string) => matchesTrustPattern(plugin.address, pattern)
  if (plugin.isLocal || state.flagPatterns.some(matches)) {
    return { kind: 'trusted', recordsContent: false }
  }
  if (!state.patterns.some(matches)) {
    return { kind: 'unknown' }
  }
  const trustedHashes = state.trustedContent[sourceOf(plugin.address)] ?? []
  const trustedHash = trustedHashes.at(-1)
  if (trustedHash === undefined) {
    return { kind: 'trusted', recordsContent: true }
  }
  return trustedHashes.includes(plugin.contentHash)
    ? { kind: 'trusted', recordsContent: false }
    : { kind: 'changed', trustedHash }
}
