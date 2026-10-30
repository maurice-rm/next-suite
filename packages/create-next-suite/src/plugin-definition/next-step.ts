/**
 * A command the end of a run suggests: a `script` of `package.json`, run with the package manager,
 * or a plain `command` as the user types it.
 */
export type NextStep =
  | {
      /** The script of `package.json`, such as `db:migrate`. */
      readonly script: string
    }
  | {
      /** The command as the user types it, such as `docker compose up -d`. */
      readonly command: string
    }
