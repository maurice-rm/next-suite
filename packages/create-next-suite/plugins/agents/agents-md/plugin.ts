import { definePlugin } from 'create-next-suite/plugin'
import { createAgentSections } from 'create-next-suite/points'

const AGENTS_FILE = 'AGENTS.md'
const TITLE_PREFIX = '# '

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
