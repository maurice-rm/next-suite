import type { Answers } from '../answers/answers.ts'
import { holdsFor } from '../answers/evaluate-condition.ts'
import type { ParsedPluginManifest } from '../contract/plugin-manifest.ts'
import type { ResolvedPostStep } from '../contract/post-step.ts'
import { assertScript } from './assert-script.ts'
import { unique, uniqueBy } from './merge-entries.ts'

/** A command the end of a run suggests: plain, or a script run with the package manager. */
export type NextStep = { command: string } | { script: string }

/** What the end of the run shows: the stack line and the suggested next commands. */
export type RunSummary = { stack: string[]; nextSteps: NextStep[] }

type Scripts = Readonly<Record<string, string>>

/** The post steps whose condition holds, in plugin order, with default messages filled in. */
export const collectPostSteps = (
  manifests: readonly ParsedPluginManifest[],
  answers: Answers,
  scripts: Scripts,
): ResolvedPostStep[] =>
  manifests.flatMap(({ name, postSteps }) =>
    (postSteps ?? [])
      .filter((step) => holdsFor(step.when, answers))
      .map((step) => {
        assertScript(scripts, step.script, `${name} runs the script after the install:`)
        return {
          script: step.script,
          running: step.running ?? `Running ${step.script}`,
          done: step.done ?? `Ran ${step.script}`,
        }
      }),
  )

type SummaryInput = {
  manifests: readonly ParsedPluginManifest[]
  baseName: string
  answers: Answers
  scripts: Scripts
}

const nextStepsOf = (
  manifest: ParsedPluginManifest,
  answers: Answers,
  scripts: Scripts,
): NextStep[] =>
  (manifest.contributes?.nextSteps ?? [])
    .filter((step) => holdsFor(step.when, answers))
    .map((step): NextStep => {
      if ('command' in step) {
        return { command: step.command }
      }
      assertScript(scripts, step.script, `${manifest.name} suggests the script`)
      return { script: step.script }
    })

/** The stack in plugin order, and the next steps with those of the base project, such as `dev`, last. */
export const collectSummary = ({
  manifests,
  baseName,
  answers,
  scripts,
}: SummaryInput): RunSummary => ({
  stack: unique(manifests.flatMap((manifest) => manifest.contributes?.stack ?? [])),
  nextSteps: uniqueBy(
    [
      ...manifests.filter((manifest) => manifest.name !== baseName),
      ...manifests.filter((manifest) => manifest.name === baseName),
    ].flatMap((manifest) => nextStepsOf(manifest, answers, scripts)),
    (step) => JSON.stringify(step),
  ),
})
