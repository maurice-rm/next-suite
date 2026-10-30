import { matchesTrustPattern } from './trust-pattern.ts'

/** A plugin as trust sees it: its address, the hash of its files and whether it is local. */
type TrustSubject = { address: string; contentHash: string; isLocal: boolean }

/** What the user trusts: patterns kept in the user configuration, patterns for this run only, and
 * the content hash last trusted for each address. */
type TrustState = {
  patterns: readonly string[]
  flagPatterns: readonly string[]
  trustedContent: Readonly<Record<string, string>>
}

/**
 * Whether a plugin may run: trusted, where `recordsContent` says to keep its content hash as the
 * one trusted from now on; changed since its content was last trusted; or from an unknown source.
 */
export type TrustVerdict =
  | { kind: 'trusted'; recordsContent: boolean }
  | { kind: 'changed'; trustedHash: string }
  | { kind: 'unknown' }

/**
 * Judges whether a plugin may run its code. A local directory the user names is trusted by
 * nature, and so is a source `--trust` covers for this run. A source the user configuration
 * trusts runs while its content is the one trusted before; its first content is recorded, and a
 * changed one has to be confirmed again. Any other source is unknown.
 */
export const judgeTrust = (plugin: TrustSubject, state: TrustState): TrustVerdict => {
  const matches = (pattern: string) => matchesTrustPattern(plugin.address, pattern)
  if (plugin.isLocal || state.flagPatterns.some(matches)) {
    return { kind: 'trusted', recordsContent: false }
  }
  if (!state.patterns.some(matches)) {
    return { kind: 'unknown' }
  }
  const trustedHash = state.trustedContent[plugin.address]
  if (trustedHash === undefined) {
    return { kind: 'trusted', recordsContent: true }
  }
  return trustedHash === plugin.contentHash
    ? { kind: 'trusted', recordsContent: false }
    : { kind: 'changed', trustedHash }
}
