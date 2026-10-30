/** The run settings a post-step may depend on. */
export type RunSettings = {
  /** Whether the run creates a git repository with a first commit. */
  readonly initializesGit: boolean
}

/** A script of `package.json` that runs after the install, such as a format run. */
export type PostStep = {
  /** The script to run, such as `format`. */
  readonly script: string
  /** What the run shows while the script runs; `Running <script>` by default. */
  readonly running?: string
  /** What the run shows when the script succeeded; `Ran <script>` by default. */
  readonly done?: string
  /** Runs the script only when this answers `true` for the run settings; always without it. */
  readonly when?: (run: RunSettings) => boolean
}
