import { definePlugin } from 'create-next-suite/plugin'

const AGENTS_FILE = 'AGENTS.md'
const TITLE_PREFIX = '# '

/** The sections of AGENTS.md, as other plugins contribute them. */
type AgentSections = {
  /** Adds a section `## <title>` with instructions for coding agents, in Markdown. */
  addSection: (title: string, text: string) => void
  /** The sections in the order they were added. */
  sections: () => readonly { title: string; text: string }[]
}

declare module 'create-next-suite/plugin' {
  interface CollectorPoints {
    /** The sections of AGENTS.md, the instructions for coding agents; the agents-md plugin provides it. */
    agents: AgentSections
  }
}

const createAgentSections = (): AgentSections => {
  const sections: { title: string; text: string }[] = []
  return {
    addSection: (title, text) => {
      sections.push({ title, text })
    },
    sections: () => [...sections],
  }
}

/** The text with its first line, the title, naming the project. */
const withTitle = (text: string, projectName: string): string =>
  `${TITLE_PREFIX}${projectName}${text.slice(text.indexOf('\n'))}`

export default definePlugin({
  name: 'agents-md',
  title: 'AGENTS.md',
  description:
    'Writes AGENTS.md and CLAUDE.md with the commands of the project and the rules plugins add.',
  category: 'agents',
  files: { 'CLAUDE.md': 'files/CLAUDE.md' },
  collects: {
    agents: {
      create: createAgentSections,
      finish: (agents, { readFile, write, projectName, packageManager, scripts }) => {
        const commands = Object.entries(scripts).map(
          ([name, command]) => `- \`${packageManager.run} ${name}\`: \`${command}\`\n`,
        )
        const sections = agents.sections().map(({ title, text }) => `\n## ${title}\n\n${text}\n`)
        const base = withTitle(readFile(`files/${AGENTS_FILE}`), projectName)
        write(AGENTS_FILE, `${base}\n${commands.join('')}${sections.join('')}`)
      },
    },
  },
})
