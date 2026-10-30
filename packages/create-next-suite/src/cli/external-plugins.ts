import { InputError } from '../input-error.ts'

/** Why plugins from outside create-next-suite cannot be loaded in this version. */
const UNAVAILABLE_REASON =
  'plugins from outside create-next-suite are moving to the plugin.ts form and cannot be loaded in this version'

/**
 * Stops a command that would load a plugin from outside create-next-suite.
 *
 * @param command - What the user asked for, such as `--plugin`.
 * @throws InputError always, naming the command and why it cannot run.
 */
export const refuseExternalPlugins = (command: string): never => {
  throw new InputError(`${command} cannot be used: ${UNAVAILABLE_REASON}`)
}
