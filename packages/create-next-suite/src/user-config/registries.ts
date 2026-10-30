import { InputError } from '../input-error.ts'
import { dropTrustedPattern, type TrustMatcher } from './trust-list.ts'
import { updateUserConfig } from './user-config.ts'

/** A registry to keep: its short name, its source and whether all its plugins are trusted. */
export type RegistryEntry = { name: string; source: string; isTrusted: boolean }

/** The trust pattern that covers every plugin of a registry, such as `@acme/*`. */
const registryTrustPattern = (name: string): string => `${name}/*`

/** Keeps a registry under its short name, replacing an earlier source of the same name. */
export const saveRegistry = (
  path: string,
  { name, source, isTrusted }: RegistryEntry,
): Promise<void> =>
  updateUserConfig(path, (config) => {
    config.registries[name] = source
    const pattern = registryTrustPattern(name)
    if (isTrusted && !config.trust.includes(pattern)) {
      config.trust.push(pattern)
    }
  })

/**
 * Forgets a registry and the trust in its plugins, with their content hashes; it fails for an
 * unknown registry.
 */
export const removeRegistry = (path: string, name: string, matches: TrustMatcher): Promise<void> =>
  updateUserConfig(path, (config) => {
    if (config.registries[name] === undefined) {
      throw new InputError(`the registry ${name} is unknown`)
    }
    delete config.registries[name]
    dropTrustedPattern(config, registryTrustPattern(name), matches)
  })
