import * as z from 'zod'

/** What happens when another plugin or the base project writes the same target already. */
export const conflictStrategySchema = z
  .enum(['error', 'skip-if-exists', 'replace'])
  .default('error')

/** Where a target path starts: the project root, or `src/` when the project uses a src directory. */
export const fileRootSchema = z.enum(['project', 'source']).default('project')
