import { InputError } from '../input-error.ts'
import { updateUserConfig } from './user-config.ts'

/** Adds a pattern to the sources the user trusts, unless it is there already. */
export const addTrustedPattern = (path: string, pattern: string): Promise<void> =>
  updateUserConfig(path, (config) => {
    if (!config.trust.includes(pattern)) {
      config.trust.push(pattern)
    }
  })

/** Removes a pattern from the sources the user trusts; it fails for a pattern not trusted. */
export const removeTrustedPattern = (path: string, pattern: string): Promise<void> =>
  updateUserConfig(path, (config) => {
    if (!config.trust.includes(pattern)) {
      throw new InputError(`${pattern} is not trusted`)
    }
    config.trust = config.trust.filter((trusted) => trusted !== pattern)
  })
