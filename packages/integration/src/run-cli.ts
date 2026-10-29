import { execFile } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

import manifest from 'create-next-suite/package.json' with { type: 'json' }

type BinName = keyof typeof manifest.bin

type CliResult = {
  stdout: string
  stderr: string
  exitCode: number
}

const execFileAsync = promisify(execFile)

const MANIFEST_URL = import.meta.resolve('create-next-suite/package.json')

const isExecError = (error: unknown): error is Error & CliResult & { code: number } =>
  error instanceof Error && 'code' in error && typeof error.code === 'number'

/** Runs a bin of the built create-next-suite package the way npm links it, with colours off. */
export const runCli = async (bin: BinName, args: string[]): Promise<CliResult> => {
  const binPath = fileURLToPath(new URL(manifest.bin[bin], MANIFEST_URL))
  const env = { ...process.env, NO_COLOR: '1' }
  try {
    const { stdout, stderr } = await execFileAsync(binPath, args, { env })
    return { stdout, stderr, exitCode: 0 }
  } catch (error) {
    if (!isExecError(error)) {
      throw error
    }
    return { stdout: error.stdout, stderr: error.stderr, exitCode: error.code }
  }
}
