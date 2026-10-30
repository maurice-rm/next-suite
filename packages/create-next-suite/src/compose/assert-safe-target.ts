import { findUnsafePathProblem } from '../file-system/find-unsafe-path-problem.ts'
import { ComposeError } from './compose-error.ts'

/**
 * Rejects a target path that could leave the project or reach into its git repository; the run
 * stops.
 */
export const assertSafeTarget = (target: string, origin: string): void => {
  const problem = findUnsafePathProblem(target)
  if (problem !== undefined) {
    throw new ComposeError(`${origin} writes to "${target}", which ${problem}`)
  }
}
