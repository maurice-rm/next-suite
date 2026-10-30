import ansis from 'ansis'

import { renderFrameLine, renderOutro } from './frame.ts'
import { brand, chosen, SYMBOLS } from './theme.ts'

const STACK_SEPARATOR = ' · '

/** A command the end of a run suggests, with the package manager it starts with, if any. */
export type SuggestedCommand = { command: string; packageManager: string | undefined }

/** What the end of a successful run shows. */
export type Outro = {
  projectName: string
  stack: readonly string[]
  nextSteps: readonly SuggestedCommand[]
  repositoryLink: string
}

const renderCommand = ({ command, packageManager }: SuggestedCommand): string =>
  packageManager !== undefined && command.startsWith(`${packageManager} `)
    ? brand(packageManager) + command.slice(packageManager.length)
    : command

const renderStack = (stack: readonly string[]): string[] =>
  stack.length === 0
    ? []
    : [
        `${renderFrameLine('')}   ${brand(SYMBOLS.corner)} ${stack.join(ansis.dim(STACK_SEPARATOR))}`,
      ]

const renderNextSteps = (nextSteps: readonly SuggestedCommand[]): string[] =>
  nextSteps.length === 0
    ? []
    : [
        renderFrameLine(''),
        renderFrameLine(ansis.bold('Next steps')),
        ...nextSteps.map((step) => renderFrameLine(`  ${renderCommand(step)}`)),
      ]

/**
 * The end of a successful run inside the frame: the project is ready, its stack, the next
 * commands, and the link to the docs closing the frame.
 */
export const renderOutroSummary = ({
  projectName,
  stack,
  nextSteps,
  repositoryLink,
}: Outro): string =>
  [
    renderFrameLine(''),
    `${chosen(SYMBOLS.submit)}  ${brand.bold(projectName)} is ready`,
    ...renderStack(stack),
    ...renderNextSteps(nextSteps),
    renderOutro(`Docs ${brand('→')} ${brand(repositoryLink)}`),
  ].join('\n')

/** The end of a successful run as plain lines for scripts and CI. */
export const renderPlainSummary = ({ projectName, nextSteps }: Outro): string =>
  [
    `${projectName} is ready`,
    ...(nextSteps.length === 0
      ? []
      : ['Next steps:', ...nextSteps.map(({ command }) => `  ${command}`)]),
    '',
  ].join('\n')
