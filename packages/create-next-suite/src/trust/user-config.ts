import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import * as z from 'zod'

import { registryName } from '../contract/identifiers.ts'
import { isMissingFileError } from '../file-system/error-code.ts'
import { readJsonFile } from '../file-system/read-json-file.ts'
import { TrustError } from './trust-error.ts'

/** Keys other tools keep in the same file, such as the server settings of `next-suite provision`, stay. */
const userConfigSchema = z.looseObject({
  trust: z.array(z.string().min(1)).default([]),
  registries: z.record(registryName, z.string().min(1)).default({}),
})

/** What a user configured for next-suite: trusted sources and registry short names. */
export type UserConfig = z.output<typeof userConfigSchema>

/** Where the user configuration lives, following the XDG convention. */
export const userConfigPath = (environment: NodeJS.ProcessEnv, home: string): string =>
  join(environment.XDG_CONFIG_HOME ?? join(home, '.config'), 'next-suite', 'config.json')

/** Reads the user configuration; a missing file is an empty configuration. */
export const readUserConfig = async (path: string): Promise<UserConfig> => {
  try {
    return await readJsonFile(
      path,
      userConfigSchema,
      (problem, options) => new TrustError(`${path} ${problem}`, options),
    )
  } catch (error) {
    if (isMissingFileError(error)) {
      return userConfigSchema.parse({})
    }
    throw error
  }
}

/** Writes the user configuration, creating its folder. */
export const writeUserConfig = async (path: string, config: UserConfig): Promise<void> => {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, `${JSON.stringify(config, null, 2)}\n`)
}
