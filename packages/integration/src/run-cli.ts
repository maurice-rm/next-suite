import { execFile } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

import packageJson from 'create-next-suite/package.json' with { type: 'json' }

type BinName = keyof typeof packageJson.bin

type CliResult = {
  stdout: string
  stderr: string
  exitCode: number
}

const PACKAGE_JSON_URL = import.meta.resolve('create-next-suite/package.json')

const execFileAsync = promisify(execFile)

const isExecError = (error: unknown): error is Error & CliResult & { code: number } =>
  error instanceof Error && 'code' in error && typeof error.code === 'number'

export const binPathOf = (bin: BinName): string =>
  fileURLToPath(new URL(packageJson.bin[bin], PACKAGE_JSON_URL))

/** Runs a bin of the built create-next-suite package the way npm links it, with colours off. */
export const runCli = async (
  bin: BinName,
  args: string[],
  options: { cwd?: string } = {},
): Promise<CliResult> => {
  const env = { ...process.env, NO_COLOR: '1' }
  try {
    const { stdout, stderr } = await execFileAsync(binPathOf(bin), args, { env, ...options })
    return { stdout, stderr, exitCode: 0 }
  } catch (error) {
    if (!isExecError(error)) {
      throw error
    }
    return { stdout: error.stdout, stderr: error.stderr, exitCode: error.code }
  }
}
