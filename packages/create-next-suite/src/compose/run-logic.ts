import * as z from 'zod'

import type { Answers } from '../answers/answers.ts'
import { optionsOf } from '../answers/plugin-options.ts'
import { type Logic, type LogicContext, logicResultSchema } from '../contract/logic.ts'
import type { ParsedPluginManifest } from '../contract/plugin-manifest.ts'
import { ComposeError } from './compose-error.ts'
import { derivedManifest } from './derived-manifest.ts'
import { askFact, type Facts } from './facts.ts'

/** A file a logic module computed, with the plugin it belongs to. */
export type LogicFile = NonNullable<z.output<typeof logicResultSchema>['files']>[number] & {
  origin: string
}

type LogicRun = {
  manifests: readonly ParsedPluginManifest[]
  logic: ReadonlyMap<string, Logic>
  answers: Answers
  project: LogicContext['project']
  facts: Facts
}

/** What the logic modules computed: a manifest per result, and the files of all results. */
type LogicOutput = {
  logicManifests: ParsedPluginManifest[]
  files: LogicFile[]
}

const contextOf = (
  manifest: ParsedPluginManifest,
  { answers, project, facts }: LogicRun,
): LogicContext => ({
  project,
  options: optionsOf(manifest.name, answers),
  settings: answers.settings,
  plugins: answers.plugins.map((plugin) => plugin.name),
  has: (fact) => askFact(facts, fact, `${manifest.name}: its logic`),
})

/**
 * Runs the logic modules of the selected plugins in plugin order. Each result becomes a manifest of
 * the same plugin with its contributions and dependencies, so it merges like any other, and a list
 * of computed files. A result that breaks the contract or asks an unknown fact fails.
 */
export const runLogic = async (run: LogicRun): Promise<LogicOutput> => {
  const output: LogicOutput = { logicManifests: [], files: [] }
  for (const manifest of run.manifests) {
    const logic = run.logic.get(manifest.name)
    if (logic === undefined) {
      continue
    }
    const parsed = logicResultSchema.safeParse(await logic(contextOf(manifest, run)))
    if (!parsed.success) {
      throw new ComposeError(
        `${manifest.name}: its logic answers something invalid\n${z.prettifyError(parsed.error)}`,
      )
    }
    const logicResult = parsed.data
    output.logicManifests.push(
      derivedManifest(manifest, {
        contributes: logicResult.contributes,
        dependencies: logicResult.dependencies,
        devDependencies: logicResult.devDependencies,
      }),
    )
    output.files.push(
      ...(logicResult.files ?? []).map((file) => ({
        ...file,
        origin: manifest.name,
      })),
    )
  }
  return output
}
