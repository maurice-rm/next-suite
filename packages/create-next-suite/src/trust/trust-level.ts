import semver from 'semver'

import type { PluginSource } from '../loader/load-plugin.ts'
import { parsePluginAddress } from '../loader/plugin-address.ts'

/**
 * How far a plugin's code is trusted: shipped with create-next-suite, trusted by the user, or not.
 */
export type TrustLevel = 'builtin' | 'trusted' | 'unknown'

const REGEX_SPECIAL = /[.+?^${}()|[\]\\]/g
const REF = /#.*$/

/** An address without its ref or version range, such as `github:acme/plugins/mail`. */
export const sourceOf = (address: string): string => {
  const parsed = parsePluginAddress(address)
  if (parsed === undefined) {
    return address
  }
  switch (parsed.kind) {
    case 'npm':
      return `npm:${parsed.name}`
    case 'github':
    case 'gitlab':
    case 'git':
      return address.replace(REF, '')
    case 'local':
    case 'url':
    case 'registry':
      return address
  }
}

/** Whether the source of an address matches a trust pattern, where `*` stands for anything. */
export const matchesTrustPattern = (address: string, pattern: string): boolean =>
  new RegExp(`^${pattern.replace(REGEX_SPECIAL, '\\$&').replaceAll('*', '.*')}$`).test(
    sourceOf(address),
  )

/**
 * The trust level of a plugin's source: built-in plugins and local directories a user names are
 * trusted by nature, other sources when they match a pattern of the trust list.
 */
export const trustLevelOf = (source: PluginSource, patterns: readonly string[]): TrustLevel => {
  if (source.kind === 'builtin') {
    return 'builtin'
  }
  const parsed = parsePluginAddress(source.address)
  if (
    parsed?.kind === 'local' ||
    patterns.some((pattern) => matchesTrustPattern(source.address, pattern))
  ) {
    return 'trusted'
  }
  return 'unknown'
}

/** Whether an address names a fixed version: a ref, an exact npm version, or a URL's content. */
export const isPinned = (address: string): boolean => {
  const parsed = parsePluginAddress(address)
  if (parsed === undefined) {
    return false
  }
  switch (parsed.kind) {
    case 'npm':
      return semver.valid(parsed.range) !== null
    case 'github':
    case 'gitlab':
    case 'git':
      return parsed.ref !== undefined
    case 'url':
    case 'local':
      return true
    case 'registry':
      return false
  }
}
