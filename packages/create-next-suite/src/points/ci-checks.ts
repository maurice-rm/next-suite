/**
 * The scripts CI runs on every change, as the users of the point `ciChecks` contribute them, such
 * as `lint`; the selected CI plugin provides it and runs them in its workflow.
 */
export type CiChecks = {
  /** Lets CI run a script of `package.json`. */
  run: (script: string) => void
}
