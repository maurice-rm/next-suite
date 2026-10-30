import { ExpectedError } from '../expected-error.ts'

/**
 * Plugins that cannot run together: a point without a provider, two providers, plugins that use
 * each other's points, a conflict, an answer outside the choices, or a plugin's step that fails.
 */
export class AssemblyError extends ExpectedError {
  override name = 'AssemblyError'
}
