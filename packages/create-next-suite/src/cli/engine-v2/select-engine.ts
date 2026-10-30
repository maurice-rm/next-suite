import { InputError } from '../../input-error.ts'

/** The engine that assembles a project: from manifests and templates, or from `plugin.ts`. */
export type Engine = 'v1' | 'v2'

/** The environment variable that selects the engine; the manifest engine without it. */
export const ENGINE_VARIABLE = 'NEXT_SUITE_ENGINE'

const ENGINES: readonly string[] = ['v1', 'v2']

const isEngine = (value: string): value is Engine => ENGINES.includes(value)

/**
 * The engine `NEXT_SUITE_ENGINE` selects: `v1` when unset or empty.
 *
 * @throws InputError for any other value than `v1` or `v2`.
 */
export const selectEngine = (value: string | undefined): Engine => {
  if (value === undefined || value === '') {
    return 'v1'
  }
  if (!isEngine(value)) {
    throw new InputError(`${ENGINE_VARIABLE} is "${value}"; use v1 or v2`)
  }
  return value
}
