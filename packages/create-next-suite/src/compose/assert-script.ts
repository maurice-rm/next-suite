import { ComposeError } from './compose-error.ts'

/** Fails when no plugin defines a script that `detail`, such as `a plugin runs in CI the script`, needs. */
export const assertScript = (
  scripts: Readonly<Record<string, string>>,
  script: string,
  detail: string,
): void => {
  if (!Object.hasOwn(scripts, script)) {
    throw new ComposeError(`${detail} "${script}", but no plugin defines it`)
  }
}
