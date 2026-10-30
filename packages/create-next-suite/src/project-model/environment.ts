import { ProjectError } from './project-error.ts'

/** An environment variable the project reads, as `.env.example` lists it. */
export type EnvVariable = {
  /** The name, such as `DATABASE_URL`. */
  name: string
  /** `server` for code on the server only, `client` for a variable the browser bundle reads. */
  scope: 'server' | 'client'
  /** What the variable is for; `.env.example` shows it as a comment. */
  description: string
  /** The value the code uses when the variable is not set. */
  default?: string
  /** The value `.env.example` shows. */
  example?: string
  /** Whether the value must not be committed, such as a key. */
  secret?: boolean
}

/** The group a variable is listed in, under `title`; `origin` names who added it in a clash. */
type EnvGroup = { title: string; origin: string }

type ListedGroup = { title: string; variables: EnvVariable[] }

/** The environment variables of all plugins, grouped by the plugin that added them first. */
export type Environment = {
  /**
   * Adds a variable to its group. A variable added again with the same definition stays in its
   * first group; a different definition is a clash.
   */
  add: (variable: EnvVariable, group: EnvGroup) => void
  /** Every variable, in the order the groups were added. */
  variables: () => readonly EnvVariable[]
  /** `.env.example`: the base file's text, then one block per group. */
  renderExample: (baseText: string) => string
}

const isSameVariable = (left: EnvVariable, right: EnvVariable): boolean =>
  JSON.stringify(Object.entries(left).sort()) === JSON.stringify(Object.entries(right).sort())

const renderGroup = ({ title, variables }: ListedGroup): string =>
  [
    `# ${title}`,
    ...variables.flatMap((variable) => [
      `# ${variable.description}`,
      `${variable.name}=${variable.example ?? ''}`,
    ]),
  ].join('\n')

export const createEnvironment = (): Environment => {
  const groups: ListedGroup[] = []
  const origins = new Map<string, string>()

  const variables = (): EnvVariable[] => groups.flatMap((group) => group.variables)

  return {
    add: (variable, { title, origin }) => {
      const existing = variables().find((candidate) => candidate.name === variable.name)
      if (existing !== undefined) {
        if (!isSameVariable(existing, variable)) {
          throw new ProjectError(
            `${origins.get(variable.name)} and ${origin} define the environment variable ${variable.name} differently`,
          )
        }
        return
      }
      origins.set(variable.name, origin)
      const group = groups.find((candidate) => candidate.title === title)
      if (group === undefined) {
        groups.push({ title, variables: [variable] })
        return
      }
      group.variables.push(variable)
    },

    variables,

    renderExample: (baseText) =>
      [baseText.trimEnd(), ...groups.map(renderGroup)]
        .filter((block) => block !== '')
        .join('\n\n')
        .concat('\n'),
  }
}
