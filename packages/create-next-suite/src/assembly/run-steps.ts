import type { NextStep } from '../plugin-definition/next-step.ts'
import type { PostStep, RunSettings } from '../plugin-definition/post-step.ts'
import { AssemblyError } from './assembly-error.ts'

/** What one plugin states for the end of the run. */
export type PluginRunSteps = {
  plugin: string
  stack: readonly string[]
  nextSteps: readonly NextStep[]
  postSteps: readonly PostStep[]
}

/** A post-step with the messages the run shows filled in. */
export type AssembledPostStep = {
  script: string
  running: string
  done: string
  /** Whether the step runs for the run settings. */
  runsFor: (run: RunSettings) => boolean
}

/** What the plugins state for the end of the run, in plugin order, without duplicates. */
export type RunSteps = {
  stack: string[]
  nextSteps: NextStep[]
  postSteps: AssembledPostStep[]
}

type Scripts = Readonly<Record<string, string>>

/** The project's scripts, read only when a step names one. */
type ReadScripts = () => Scripts

const assertScript = (scripts: ReadScripts, script: string, detail: string): void => {
  if (!Object.hasOwn(scripts(), script)) {
    throw new AssemblyError(`${detail} "${script}", but no plugin defines it`)
  }
}

const unique = <Value>(values: readonly Value[], key: (value: Value) => string): Value[] =>
  values.filter((value, index) => values.findIndex((other) => key(other) === key(value)) === index)

const resolvePostStep = (
  plugin: string,
  step: PostStep,
  scripts: ReadScripts,
): AssembledPostStep => {
  assertScript(scripts, step.script, `${plugin} runs the script after the install:`)
  const { when } = step
  return {
    script: step.script,
    running: step.running ?? `Running ${step.script}`,
    done: step.done ?? `Ran ${step.script}`,
    runsFor: (run) => when === undefined || when(run),
  }
}

/**
 * The stack, next steps and post-steps of the plugins that run, in plugin order; each script they
 * name must be one of the project's.
 *
 * @throws AssemblyError when a next step or post-step names a script the project lacks.
 */
export const collectRunSteps = (
  plugins: readonly PluginRunSteps[],
  scripts: ReadScripts,
): RunSteps => ({
  stack: unique(
    plugins.flatMap(({ stack }) => stack),
    (entry) => entry,
  ),
  nextSteps: unique(
    plugins.flatMap(({ plugin, nextSteps }) =>
      nextSteps.map((step) => {
        if ('script' in step) {
          assertScript(scripts, step.script, `${plugin} suggests the script`)
        }
        return step
      }),
    ),
    (step) => JSON.stringify(step),
  ),
  postSteps: plugins.flatMap(({ plugin, postSteps }) =>
    postSteps.map((step) => resolvePostStep(plugin, step, scripts)),
  ),
})
