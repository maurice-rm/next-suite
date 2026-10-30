import {
  type ChildProcessWithoutNullStreams,
  type SpawnOptionsWithoutStdio,
  spawn,
} from 'node:child_process'

/** A command may run this long, enough for a slow install, before it is stopped. */
const COMMAND_TIMEOUT_MS = 600_000
const IS_WINDOWS = process.platform === 'win32'

/** How a command ended, with its output on stdout and stderr together. */
export type CommandResult = { isSuccess: boolean; output: string }

/** Runs a command in a directory and answers how it ended; a command that cannot start fails. */
export type CommandRunner = (
  command: string,
  args: readonly string[],
  cwd: string,
) => Promise<CommandResult>

/** Passes through the Windows shell as it is: no space and no character cmd.exe reads. */
const PLAIN_ARGUMENT = /^[\w@+=:,./\\-]+$/
/** Read by cmd.exe even inside double quotes, which have no escape there. */
const UNQUOTABLE_CHARACTER = /["%!\r\n]/

const quoteForShell = (arg: string): string => {
  if (UNQUOTABLE_CHARACTER.test(arg)) {
    throw new Error(`cannot pass the argument ${JSON.stringify(arg)} through the Windows shell`)
  }
  return PLAIN_ARGUMENT.test(arg) ? arg : `"${arg}"`
}

/**
 * The command line for the Windows shell, which starts `.cmd` shims such as npm, pnpm and yarn;
 * without a shell, Node starts only `.exe` files there (nodejs.org/api/child_process.html,
 * "Spawning .bat and .cmd files on Windows"). Arguments come from plugins too, such as script
 * names, so an argument the shell would read is quoted or refused.
 */
export const toShellCommand = (command: string, args: readonly string[]): string =>
  [command, ...args].map(quoteForShell).join(' ')

/**
 * Runs a command with stdin closed, so a prompt cannot hang the run, and captures its output, so
 * it never draws over the wizard.
 */
export const runCommand: CommandRunner = (command, args, cwd) =>
  new Promise((resolve) => {
    let output = ''
    const options: SpawnOptionsWithoutStdio = { cwd, timeout: COMMAND_TIMEOUT_MS }
    let child: ChildProcessWithoutNullStreams
    try {
      child = IS_WINDOWS
        ? spawn(toShellCommand(command, args), { ...options, shell: true })
        : spawn(command, args, options)
    } catch (error) {
      resolve({ isSuccess: false, output: error instanceof Error ? error.message : String(error) })
      return
    }
    child.stdin.end()
    child.stdout.on('data', (chunk: Buffer) => {
      output += chunk.toString()
    })
    child.stderr.on('data', (chunk: Buffer) => {
      output += chunk.toString()
    })
    child.once('error', (error) => resolve({ isSuccess: false, output: error.message }))
    child.once('close', (code) => resolve({ isSuccess: code === 0, output }))
  })
