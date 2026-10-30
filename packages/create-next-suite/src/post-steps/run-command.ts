import {
  type ChildProcessWithoutNullStreams,
  type SpawnOptionsWithoutStdio,
  spawn,
} from 'node:child_process'

/** A command may run this long, enough for a slow install, before it is stopped. */
const COMMAND_TIMEOUT_MS = 600_000
const IS_WINDOWS = process.platform === 'win32'

/** How a command ended. */
export type CommandResult = {
  /** Whether the command exited with code 0. */
  isSuccess: boolean
  /**
   * What the command printed on stdout and stderr together, and why it did not start or was
   * stopped.
   */
  output: string
}

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

const MS_PER_SECOND = 1000

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

const timeoutNote = (timeoutMs: number): string =>
  `stopped after ${timeoutMs / MS_PER_SECOND} seconds, the time a command may take`

/**
 * A command runner that stops a command after `timeoutMs`. It runs with stdin closed, so a prompt
 * cannot hang the run, and captures the output, so it never draws over the wizard.
 */
export const createCommandRunner =
  (timeoutMs: number): CommandRunner =>
  (command, args, cwd) =>
    new Promise((resolve) => {
      let output = ''
      const options: SpawnOptionsWithoutStdio = { cwd, timeout: timeoutMs }
      let child: ChildProcessWithoutNullStreams
      try {
        child = IS_WINDOWS
          ? spawn(toShellCommand(command, args), { ...options, shell: true })
          : spawn(command, args, options)
      } catch (error) {
        resolve({
          isSuccess: false,
          output: error instanceof Error ? error.message : String(error),
        })
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
      child.once('close', (code, signal) => {
        // Node kills a command that exceeds `timeout` itself; nothing else here kills one.
        const isTimedOut = signal !== null && child.killed
        resolve({
          isSuccess: code === 0,
          output: isTimedOut ? [output, timeoutNote(timeoutMs)].join('\n') : output,
        })
      })
    })

/** Runs a command with the time limit of a slow install. */
export const runCommand: CommandRunner = createCommandRunner(COMMAND_TIMEOUT_MS)
