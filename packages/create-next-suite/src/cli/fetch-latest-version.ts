import * as z from 'zod'

const REGISTRY_URL = 'https://registry.npmjs.org/create-next-suite/latest'
/** Long enough for a normal connection, short enough that an offline start does not feel slow. */
const TIMEOUT_MS = 700

const latestSchema = z.object({ version: z.string() })

/**
 * Asks the npm registry for the latest version of create-next-suite. Any failure, such as being
 * offline or a timeout, answers nothing: the version hint is a courtesy, never a reason to fail.
 */
export const fetchLatestVersion = async (): Promise<string | undefined> => {
  try {
    const response = await fetch(REGISTRY_URL, { signal: AbortSignal.timeout(TIMEOUT_MS) })
    if (!response.ok) {
      return undefined
    }
    const latest = latestSchema.safeParse(await response.json())
    return latest.success ? latest.data.version : undefined
  } catch {
    return undefined
  }
}
