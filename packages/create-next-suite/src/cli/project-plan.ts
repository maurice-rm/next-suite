import type { NextStep } from '../plugin-definition/next-step.ts'

/** A file a run will write, and the plugin or part of the core that wrote it. */
type PlannedFile = { path: string; content: string; origin: string }

/** A script that runs after the install, with what the run shows for it. */
type PlannedPostStep = { script: string; running: string; done: string }

/** Everything a run will write and run, before anything is written. */
export type ProjectPlan = {
  files: PlannedFile[]
  dependencies: Record<string, string>
  devDependencies: Record<string, string>
  /** The command of the selected package manager, if a package manager plugin is selected. */
  packageManager: string | undefined
  /** The package manager the commands of the project use: the selected one, npm without one. */
  projectPackageManager: string
  installArgs: string[]
  /** The scripts to run after the install, in plugin order. */
  postSteps: PlannedPostStep[]
  /** What the end of the run shows: the stack line and the suggested next commands. */
  summary: { stack: string[]; nextSteps: NextStep[] }
}
