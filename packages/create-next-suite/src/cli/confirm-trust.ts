import type { LoadedPlugin } from '../loader/load-plugin.ts'
import { TrustError } from '../trust/trust-error.ts'
import { isPinned, matchesTrustPattern, sourceOf, trustLevelOf } from '../trust/trust-level.ts'
import { PromptCancelledError } from '../ui/prompt-cancelled-error.ts'
import { GO_BACK, type Streams, select } from '../ui/prompts.ts'
import { addTrustedPattern } from '../user-config/trust-list.ts'
import { readUserConfig } from '../user-config/user-config.ts'

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

/** How long the user trusts a source: for this run, or from now on. */
type TrustReply = typeof ONCE | typeof ALWAYS

const describePlugin = (plugin: LoadedPlugin): string => {
  const { source, manifest } = plugin
  const address = source.kind === 'external' ? source.address : manifest.name
  const resolved =
    source.kind === 'external' && source.resolved !== undefined ? ` (${source.resolved})` : ''
  return `${manifest.name} ${manifest.version} from ${address}${resolved}`
}

const askForTrust = async (
  plugin: LoadedPlugin,
  address: string,
  streams: Streams,
): Promise<TrustReply> => {
  const reply = await select<TrustReply | typeof CANCEL>({
    ...streams,
    canGoBack: false,
    message: `${describePlugin(plugin)} comes from an untrusted source and can run code on your machine. Use it?`,
    choices: [
      ...(isPinned(address) ? [{ value: ONCE, label: 'Allow this version once' } as const] : []),
      { value: ALWAYS, label: `Always trust ${sourceOf(address)}` },
      { value: CANCEL, label: 'Cancel' },
    ],
    initialValue: CANCEL,
  })
  if (reply === CANCEL || reply === GO_BACK) {
    throw new PromptCancelledError()
  }
  return reply
}

/**
 * Checks every external plugin of a run: built-in plugins, local directories and trusted sources pass;
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
  const { trust } = await readUserConfig(userConfigPath)
  for (const plugin of plugins) {
    const { source } = plugin
    if (source.kind !== 'external' || (isDryRun && plugin.manifest.logic === undefined)) {
      continue
    }
    if (trustLevelOf(source, trust) !== 'unknown') {
      continue
    }
    if (flagPatterns.some((pattern) => matchesTrustPattern(source.address, pattern))) {
      continue
    }
    if (streams === undefined) {
      throw new TrustError(
        `${describePlugin(plugin)} comes from an untrusted source; pass --trust "${sourceOf(source.address)}" or add the pattern to "trust" in ${userConfigPath}`,
      )
    }
    if ((await askForTrust(plugin, source.address, streams)) === ALWAYS) {
      const pattern = sourceOf(source.address)
      await addTrustedPattern(userConfigPath, pattern)
      trust.push(pattern)
    }
  }
}
