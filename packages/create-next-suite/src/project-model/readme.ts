import { ProjectError } from './project-error.ts'

const SCRIPTS_HEADING = '## Scripts'
const TITLE_PREFIX = '# '
/** How the base README runs a script; the package manager of the project replaces it. */
const BASE_RUN_COMMAND = 'npm run '
const NEXT_HEADING = '\n## '
const TABLE_HEADER = ['| Script | Command |', '| --- | --- |']

type ReadmeSection = { title: string; text: string; origin: string }

/** The project's README: the base text, its scripts table kept current and sections appended. */
export type Readme = {
  /** Replaces the title, the first line `# …`. */
  setTitle: (title: string) => void
  /** Replaces how the base runs a script, `npm run`, at the start of each line, such as `pnpm run`. */
  setRunCommand: (command: string) => void
  /** Appends a section `## <title>`; a title two plugins use is a clash. */
  addSection: (title: string, text: string, origin: string) => void
  /** The README with `scripts` in the table under `## Scripts`, if it has one, and the sections. */
  print: (scripts: Readonly<Record<string, string>>) => string
}

const renderScripts = (scripts: Readonly<Record<string, string>>): string =>
  [
    SCRIPTS_HEADING,
    '',
    ...TABLE_HEADER,
    ...Object.entries(scripts).map(([name, command]) => `| \`${name}\` | \`${command}\` |`),
  ].join('\n')

/** The base text with its scripts section rendered anew, or as it is without one. */
const withScripts = (text: string, scripts: Readonly<Record<string, string>>): string => {
  const start = text.indexOf(SCRIPTS_HEADING)
  if (start === -1) {
    return text
  }
  const next = text.indexOf(NEXT_HEADING, start)
  const end = next === -1 ? text.trimEnd().length : next
  return `${text.slice(0, start)}${renderScripts(scripts)}\n${text.slice(end)}`
}

const withTitle = (text: string, title: string): string => {
  const end = text.indexOf('\n')
  const firstLine = end === -1 ? text : text.slice(0, end)
  if (!firstLine.startsWith(TITLE_PREFIX)) {
    throw new ProjectError('README.md does not start with a title "# …"')
  }
  return `${TITLE_PREFIX}${title}${end === -1 ? '' : text.slice(end)}`
}

const withRunCommand = (text: string, command: string): string =>
  text
    .split('\n')
    .map((line) =>
      line.startsWith(BASE_RUN_COMMAND)
        ? `${command} ${line.slice(BASE_RUN_COMMAND.length)}`
        : line,
    )
    .join('\n')

export const openReadme = (baseText: string): Readme => {
  const sections: ReadmeSection[] = []
  let text = baseText
  return {
    setTitle: (title) => {
      text = withTitle(text, title)
    },
    setRunCommand: (command) => {
      text = withRunCommand(text, command)
    },
    addSection: (title, sectionText, origin) => {
      const existing = sections.find((section) => section.title === title)
      if (existing !== undefined) {
        throw new ProjectError(
          `${existing.origin} and ${origin} both add the README section "${title}"`,
        )
      }
      sections.push({ title, text: sectionText, origin })
    },
    print: (scripts) => {
      const base = withScripts(text, scripts)
      if (sections.length === 0) {
        return base
      }
      const blocks = sections.map((section) => `## ${section.title}\n\n${section.text.trimEnd()}`)
      return `${[base.trimEnd(), ...blocks].join('\n\n')}\n`
    },
  }
}
