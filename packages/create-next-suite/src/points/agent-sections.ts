/**
 * The sections of the instructions for coding agents, as the users of the point `agents` contribute
 * them; the agents-md plugin provides it and writes them into `AGENTS.md`.
 */
export type AgentSections = {
  /** Adds a section `## <title>` with instructions for coding agents, in Markdown. */
  addSection: (title: string, text: string) => void
  /** The sections in the order they were added. */
  sections: () => readonly { title: string; text: string }[]
}

/**
 * Creates the collector of the point `agents`, for the plugin that provides it, such as agents-md.
 * Every section added is kept, in the order it was added.
 *
 * @returns An empty collector.
 *
 * @example
 * ```ts
 * definePlugin({
 *   name: 'acme-agents',
 *   title: 'Acme agents',
 *   category: 'agents',
 *   collects: {
 *     agents: {
 *       create: createAgentSections,
 *       finish: (agents, { write }) => {
 *         const sections = agents.sections().map(({ title, text }) => `## ${title}\n\n${text}\n`)
 *         write('AGENTS.md', sections.join('\n'))
 *       },
 *     },
 *   },
 * })
 * ```
 */
export const createAgentSections = (): AgentSections => {
  const sections: { title: string; text: string }[] = []
  return {
    addSection: (title, text) => {
      sections.push({ title, text })
    },
    sections: () => [...sections],
  }
}
