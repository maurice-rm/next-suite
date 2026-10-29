import ansis from 'ansis'

import { brand, pick, SYMBOLS } from './theme.ts'

const STACK_SEPARATOR = ' · '
const CORNER = process.platform === 'win32' ? '>' : '↳'

/** What the end of a successful run shows. */
export type Outro = {
  projectName: string
  stack: readonly string[]
  /** Commands to run next, each with the package manager it starts with, if any. */
  nextSteps: readonly { command: string; packageManager: string | undefined }[]
  docsLink: string
}

const bar = (content = ''): string =>
  content === '' ? ansis.gray(SYMBOLS.bar) : `${ansis.gray(SYMBOLS.bar)}  ${content}`

const renderCommand = ({ command, packageManager }: Outro['nextSteps'][number]): string =>
  packageManager !== undefined && command.startsWith(`${packageManager} `)
    ? brand(packageManager) + command.slice(packageManager.length)
    : command

/**
 * The end of a successful run inside the frame: the project is ready, its stack, the next
 * commands, and the link to the docs closing the frame.
 */
export const renderOutroSummary = ({ projectName, stack, nextSteps, docsLink }: Outro): string => {
  const lines = [
    bar(),
    `${pick(SYMBOLS.submit)}  ${brand.bold(projectName)} is ready`,
    ...(stack.length === 0
      ? []
      : [`${bar()}   ${brand(CORNER)} ${stack.join(ansis.dim(STACK_SEPARATOR))}`]),
    ...(nextSteps.length === 0
      ? []
      : [
          bar(),
          bar(ansis.bold('Next steps')),
          ...nextSteps.map((step) => bar(`  ${renderCommand(step)}`)),
        ]),
    `${ansis.gray(SYMBOLS.barEnd)}  Docs ${brand('→')} ${brand(docsLink)}`,
  ]
  return `${lines.join('\n')}\n\n`
}

/** The end of a successful run as plain lines for scripts and CI. */
export const renderPlainSummary = ({ projectName, nextSteps }: Outro): string =>
  [
    `${projectName} is ready`,
    ...(nextSteps.length === 0
      ? []
      : ['Next steps:', ...nextSteps.map(({ command }) => `  ${command}`)]),
    '',
  ].join('\n')
