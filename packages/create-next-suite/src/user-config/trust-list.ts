import { InputError } from '../input-error.ts'
import { type UserConfig, updateUserConfig } from './user-config.ts'

/** Whether a plugin address or source falls under a trust pattern. */
export type TrustMatcher = (address: string, pattern: string) => boolean

/** Adds a pattern to the sources the user trusts, unless it is there already. */
export const addTrustedPattern = (path: string, pattern: string): Promise<void> =>
  updateUserConfig(path, (config) => {
    if (!config.trust.includes(pattern)) {
      config.trust.push(pattern)
    }
  })

/**
 * Drops a pattern from a configuration, with the content hashes of the sources it covered that no
 * remaining pattern covers.
 */
export const dropTrustedPattern = (
  config: UserConfig,
  pattern: string,
  matches: TrustMatcher,
): void => {
  config.trust = config.trust.filter((trusted) => trusted !== pattern)
  for (const source of Object.keys(config.trustedContent)) {
    const isStillTrusted = config.trust.some((trusted) => matches(source, trusted))
    if (matches(source, pattern) && !isStillTrusted) {
      delete config.trustedContent[source]
    }
  }
}

/**
 * Removes a pattern from the sources the user trusts, with the content hashes only it covered;
 * it fails for a pattern not trusted.
 */
export const removeTrustedPattern = (
  path: string,
  pattern: string,
  matches: TrustMatcher,
): Promise<void> =>
  updateUserConfig(path, (config) => {
    if (!config.trust.includes(pattern)) {
      throw new InputError(`${pattern} is not trusted`)
    }
    dropTrustedPattern(config, pattern, matches)
  })

/** Adds a content hash to those the user trusts for a source. */
export const recordTrustedContent = (
  path: string,
  { source, contentHash }: { source: string; contentHash: string },
): Promise<void> =>
  updateUserConfig(path, (config) => {
    const hashes = config.trustedContent[source] ?? []
    config.trustedContent[source] = hashes.includes(contentHash) ? hashes : [...hashes, contentHash]
  })
