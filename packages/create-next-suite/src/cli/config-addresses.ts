import { resolve } from 'node:path'

import { parsePluginAddress } from '../loader/plugin-address.ts'
import type { LoadedSuiteConfig } from '../project-config/load-suite-config.ts'

/** A plugin entry of a config that is an address or a path, and the address it is fetched from. */
export type ConfigAddress = { entry: string; address: string }

/**
 * The entries of a config that name an external plugin: an address as written, a path relative to
 * the config as its absolute directory.
 */
export const configAddresses = ({ config, directory }: LoadedSuiteConfig): ConfigAddress[] =>
  config.plugins.flatMap((entry) => {
    if (typeof entry !== 'string') {
      return []
    }
    const parsed = parsePluginAddress(entry)
    if (parsed === undefined) {
      return []
    }
    return [{ entry, address: parsed.kind === 'local' ? resolve(directory, entry) : entry }]
  })
