import type { LoadedPlugin } from '../loader/load-plugin.ts'
import { TrustError } from '../trust/trust-error.ts'
import { isPinned, matchesPattern, sourcePattern, trustLevelOf } from '../trust/trust-level.ts'
import { readUserConfig, writeUserConfig } from '../trust/user-config.ts'
import { PromptCancelledError } from '../ui/prompt-cancelled-error.ts'
import { type Streams, select } from '../ui/prompts.ts'

type TrustCheck = {
  plugins: readonly LoadedPlugin[]
  /** A dry run writes and runs nothing, so plugins without a logic module need no trust. */
  isDryRun: boolean
  /** Patterns from `--trust`, trusted for this run only. */
  flagPatterns: readonly string[]
  userConfigPath: string
  /** The terminal to ask in, or nothing without one. */
  streams: Streams | undefined
}

const ONCE = 'once'
const ALWAYS = 'always'
const CANCEL = 'cancel'

const describe = (plugin: LoadedPlugin): string => {
  const { source, manifest } = plugin
  const address = source.kind === 'external' ? source.address : manifest.name
  const resolved =
    source.kind === 'external' && source.resolved !== undefined ? ` (${source.resolved})` : ''
  return `${manifest.name} ${manifest.version} from ${address}${resolved}`
}

const ask = async (plugin: LoadedPlugin, address: string, streams: Streams): Promise<string> => {
  const pattern = sourcePattern(address)
  const reply = await select({
    ...streams,
    canGoBack: false,
    message: `${describe(plugin)} comes from an untrusted source and can run code on your machine. Use it?`,
    choices: [
      ...(isPinned(address) ? [{ value: ONCE, label: 'Allow this version once' }] : []),
      { value: ALWAYS, label: `Always trust ${pattern}` },
      { value: CANCEL, label: 'Cancel' },
    ],
    initialValue: CANCEL,
  })
  if (reply === CANCEL || typeof reply !== 'string') {
    throw new PromptCancelledError()
  }
  return reply
}

/**
 * Checks every external plugin of a run: built-in plugins, local folders and trusted sources pass;
 * any other source is asked about in the terminal, where "always" adds it to the trust list, and
 * fails without one unless `--trust` covers it. A plugin without a logic module can still run code
 * through its scripts, post-steps or config files, so only a dry run skips it.
 */
export const confirmTrust = async ({
  plugins,
  isDryRun,
  flagPatterns,
  userConfigPath,
  streams,
}: TrustCheck): Promise<void> => {
  const config = await readUserConfig(userConfigPath)
  for (const plugin of plugins) {
    const { source } = plugin
    if (source.kind !== 'external' || (isDryRun && plugin.manifest.logic === undefined)) {
      continue
    }
    if (trustLevelOf(source, config.trust) !== 'unknown') {
      continue
    }
    if (flagPatterns.some((pattern) => matchesPattern(source.address, pattern))) {
      continue
    }
    if (streams === undefined) {
      throw new TrustError(
        `${describe(plugin)} comes from an untrusted source; pass --trust "${sourcePattern(source.address)}" or add the pattern to "trust" in ${userConfigPath}`,
      )
    }
    if ((await ask(plugin, source.address, streams)) === ALWAYS) {
      config.trust.push(sourcePattern(source.address))
      await writeUserConfig(userConfigPath, config)
    }
  }
}
