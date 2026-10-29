import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import * as z from 'zod'

import { TrustError } from './trust-error.ts'

/** Keys other tools keep in the same file, such as the server settings of `next-suite provision`, stay. */
const userConfigSchema = z.looseObject({
  trust: z.array(z.string().min(1)).default([]),
  registries: z.record(z.string().regex(/^@[a-z0-9][a-z0-9-]*$/), z.string().min(1)).default({}),
})

/** What a user configured for next-suite: trusted sources and registry short names. */
export type UserConfig = z.output<typeof userConfigSchema>

/** Where the user configuration lives, following the XDG convention. */
export const userConfigPath = (environment: NodeJS.ProcessEnv, home: string): string =>
  join(environment.XDG_CONFIG_HOME ?? join(home, '.config'), 'next-suite', 'config.json')

const isMissing = (error: unknown): boolean =>
  error instanceof Error && 'code' in error && error.code === 'ENOENT'

/** Reads the user configuration; a missing file is an empty configuration. */
export const readUserConfig = async (path: string): Promise<UserConfig> => {
  const text = await readFile(path, 'utf8').catch((error: unknown) => {
    if (isMissing(error)) {
      return '{}'
    }
    throw error
  })
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch (error) {
    throw new TrustError(`${path} is no valid JSON`, { cause: error })
  }
  const parsed = userConfigSchema.safeParse(json)
  if (!parsed.success) {
    throw new TrustError(
      `${path} is no valid next-suite configuration\n${z.prettifyError(parsed.error)}`,
    )
  }
  return parsed.data
}

/** Writes the user configuration, creating its folder. */
export const writeUserConfig = async (path: string, config: UserConfig): Promise<void> => {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, `${JSON.stringify(config, null, 2)}\n`)
}
