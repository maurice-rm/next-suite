import * as z from 'zod'

import type { Answers } from '../answers/answers.ts'
import { type Logic, type LogicContext, logicResultSchema } from '../contract/logic.ts'
import type { ParsedPluginManifest } from '../contract/plugin-manifest.ts'
import { ComposeError } from './compose-error.ts'

/** A file a logic module computed, with the plugin it belongs to. */
type LogicFile = NonNullable<z.output<typeof logicResultSchema>['files']>[number] & {
  origin: string
}

type LogicRun = {
  manifests: readonly ParsedPluginManifest[]
  logic: ReadonlyMap<string, Logic>
  answers: Answers
  project: LogicContext['project']
  facts: ReadonlyMap<string, boolean>
}

const optionsOf = (pluginName: string, answers: Answers): LogicContext['options'] => {
  const prefix = `${pluginName}.`
  return Object.fromEntries(
    Object.entries(answers.options)
      .filter(([key]) => key.startsWith(prefix))
      .map(([key, value]) => [key.slice(prefix.length), value]),
  )
}

/**
 * Runs the logic modules of the selected plugins in plugin order. Each result becomes a manifest of
 * the same plugin with its contributions and dependencies, so it merges like any other, and a list
 * of computed files. A result that breaks the contract or asks an unknown fact fails.
 */
export const runLogic = async ({ manifests, logic, answers, project, facts }: LogicRun) => {
  const extraManifests: ParsedPluginManifest[] = []
  const files: LogicFile[] = []
  for (const manifest of manifests) {
    const run = logic.get(manifest.name)
    if (run === undefined) {
      continue
    }
    const context: LogicContext = {
      project,
      options: optionsOf(manifest.name, answers),
      settings: answers.settings,
      plugins: answers.plugins.map((plugin) => plugin.name),
      has: (fact) => {
        const holds = facts.get(fact)
        if (holds === undefined) {
          throw new ComposeError(`${manifest.name}: its logic asks the unknown fact "${fact}"`)
        }
        return holds
      },
    }
    const parsed = logicResultSchema.safeParse(await run(context))
    if (!parsed.success) {
      throw new ComposeError(
        `${manifest.name}: its logic answers something invalid\n${z.prettifyError(parsed.error)}`,
      )
    }
    const result = parsed.data
    extraManifests.push({
      name: manifest.name,
      version: manifest.version,
      contract: manifest.contract,
      title: manifest.title,
      description: manifest.description,
      ...(result.dependencies === undefined ? {} : { dependencies: result.dependencies }),
      ...(result.devDependencies === undefined ? {} : { devDependencies: result.devDependencies }),
      ...(result.contributes === undefined ? {} : { contributes: result.contributes }),
    })
    files.push(...(result.files ?? []).map((file) => ({ ...file, origin: manifest.name })))
  }
  return { extraManifests, files }
}
