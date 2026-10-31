import type { FetchedPlugin } from '../loader/fetch-external-plugin.ts'
import { judgeTrust, type TrustVerdict } from '../trust/judge-trust.ts'
import { TrustError } from '../trust/trust-error.ts'
import { isPinned, sourceOf } from '../trust/trust-pattern.ts'
import { PromptCancelledError } from '../ui/prompt-cancelled-error.ts'
import { GO_BACK, type Streams, select } from '../ui/prompts.ts'
import { addTrustedPattern, recordTrustedContent } from '../user-config/trust-list.ts'
import { readUserConfig } from '../user-config/user-config.ts'

type TrustCheck = {
  /** The external plugins the run selects; their code runs once this check passes. */
  plugins: readonly FetchedPlugin[]
  /** Patterns from `--trust`, trusted for this run only. */
  flagPatterns: readonly string[]
  userConfigPath: string
  /** The terminal to ask in, or nothing when the run cannot ask. */
  streams: Streams | undefined
}

const ONCE = 'once'
const ALWAYS = 'always'
const CANCEL = 'cancel'
/** How many characters of a content hash a message shows. */
const SHORT_HASH_LENGTH = 'sha256-'.length + 12

/** How long the user trusts a plugin: for this run, or from now on. */
type TrustReply = typeof ONCE | typeof ALWAYS

/**
 * What the question about a plugin says: the plugin, what is wrong with it and the label of the
 * choice that trusts it from now on; without a terminal, the run fails with the problem and the
 * remedy instead.
 */
type TrustQuestion = {
  plugin: FetchedPlugin
  problem: string
  alwaysLabel: string
  remedy: string
}

const shortHash = (hash: string): string => hash.slice(0, SHORT_HASH_LENGTH)

/**
 * The plugin as the trust question shows it, from the metadata read without running it: its
 * title and name, address and what the address resolved to, the plugin it replaces and the points
 * it provides.
 */
const describePlugin = ({ address, resolved, contentHash, summary }: FetchedPlugin): string => {
  const { metadata, points } = summary
  const pinned = resolved === undefined ? '' : ` at ${resolved}`
  const replaces =
    metadata.replaces === undefined
      ? ''
      : ` It replaces the plugin ${metadata.replaces} and takes over its points.`
  const provided = [...points.provides, ...points.collects]
  const provides = provided.length === 0 ? '' : ` It provides the points ${provided.join(', ')}.`
  return `${metadata.title} (${metadata.name}) from ${address}${pinned}, content ${shortHash(contentHash)}.${replaces}${provides}`
}

const askForTrust = async (
  { plugin, problem, alwaysLabel }: TrustQuestion,
  streams: Streams,
): Promise<TrustReply> => {
  const reply = await select<TrustReply | typeof CANCEL>({
    ...streams,
    canGoBack: false,
    message: `${describePlugin(plugin)} It ${problem} and can run code on your machine. Use it?`,
    choices: [
      ...(isPinned(plugin.address)
        ? [{ value: ONCE, label: 'Allow this version once' } as const]
        : []),
      { value: ALWAYS, label: alwaysLabel },
      { value: CANCEL, label: 'Cancel' },
    ],
    initialValue: CANCEL,
  })
  if (reply === CANCEL || reply === GO_BACK) {
    throw new PromptCancelledError()
  }
  return reply
}

const questionFor = (
  plugin: FetchedPlugin,
  verdict: Exclude<TrustVerdict, { kind: 'trusted' }>,
  userConfigPath: string,
): TrustQuestion => {
  const source = sourceOf(plugin.address)
  if (verdict.kind === 'changed') {
    return {
      plugin,
      problem: `changed since you trusted its content ${shortHash(verdict.trustedHash)}`,
      alwaysLabel: 'Trust the new content',
      remedy: `check the change, then pass --trust "${source}" to run it`,
    }
  }
  return {
    plugin,
    problem: 'comes from an untrusted source',
    alwaysLabel: `Always trust ${source}`,
    remedy: `pass --trust "${source}" or add the pattern to "trust" in ${userConfigPath}`,
  }
}

const contentOf = ({ address, contentHash }: FetchedPlugin) => ({
  source: sourceOf(address),
  contentHash,
})

/**
 * Checks every external plugin a run selects before any of its code runs. A local directory, a
 * source `--trust` covers and a trusted source whose content is unchanged pass; the first content
 * of a trusted source is recorded. Any other plugin is asked about in the terminal, where
 * "always" trusts the source or the new content from now on, and fails without one. A dry run
 * runs plugin code too, so it is checked the same way.
 *
 * @throws TrustError for a plugin that would need a question in a run that cannot ask.
 * @throws PromptCancelledError when the user cancels a question.
 */
export const confirmTrust = async ({
  plugins,
  flagPatterns,
  userConfigPath,
  streams,
}: TrustCheck): Promise<void> => {
  const { trust, trustedContent } = await readUserConfig(userConfigPath)
  for (const plugin of plugins) {
    const verdict = judgeTrust(plugin, { patterns: trust, flagPatterns, trustedContent })
    if (verdict.kind === 'trusted') {
      if (verdict.recordsContent) {
        await recordTrustedContent(userConfigPath, contentOf(plugin))
      }
      continue
    }
    const question = questionFor(plugin, verdict, userConfigPath)
    if (streams === undefined) {
      throw new TrustError(
        `${plugin.summary.metadata.name} from ${plugin.address} ${question.problem}; ${question.remedy}`,
      )
    }
    if ((await askForTrust(question, streams)) === ONCE) {
      continue
    }
    if (verdict.kind === 'unknown') {
      const pattern = sourceOf(plugin.address)
      await addTrustedPattern(userConfigPath, pattern)
      trust.push(pattern)
    }
    const content = contentOf(plugin)
    await recordTrustedContent(userConfigPath, content)
    trustedContent[content.source] = [
      ...(trustedContent[content.source] ?? []),
      content.contentHash,
    ]
  }
}
