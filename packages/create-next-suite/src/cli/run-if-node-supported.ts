import packageJson from '../../package.json' with { type: 'json' }
import { EXIT_FAILURE } from './exit-code.ts'
import { findNodeVersionProblem } from './find-node-version-problem.ts'

/**
 * Runs a command of the package when this Node.js satisfies its engines range, and sets the exit
 * code of the process to what the command answers. On an older Node.js it prints why instead.
 */
export const runIfNodeSupported = async (
  command: string,
  start: () => Promise<number>,
): Promise<void> => {
  const problem = findNodeVersionProblem({
    command,
    current: process.versions.node,
    required: packageJson.engines.node,
  })
  if (problem !== undefined) {
    process.stderr.write(`${problem}\n`)
    process.exitCode = EXIT_FAILURE
    return
  }
  process.exitCode = await start()
}
