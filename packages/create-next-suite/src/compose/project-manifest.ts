import type { Answers } from '../answers/answers.ts'
import { CONTRACT_VERSION } from '../contract/plugin-manifest.ts'
import type { LoadedPlugin } from '../loader/load-plugin.ts'

export const PROJECT_MANIFEST_FILE = 'next-suite.json'

type ProjectManifestInput = {
  cliVersion: string
  createdAt: Date
  plugins: readonly LoadedPlugin[]
  answers: Answers
}

const answersByName = (answers: Answers): Record<string, unknown> => {
  const byName: Record<string, unknown> = {}
  for (const plugin of answers.plugins) {
    if (plugin.category === undefined) {
      byName[plugin.name] = true
      continue
    }
    const previous = byName[plugin.category]
    byName[plugin.category] = previous === undefined ? plugin.name : [previous, plugin.name].flat()
  }
  return { ...byName, ...answers.settings, ...answers.options }
}

/**
 * The content of next-suite.json: what generated the project, for people, a later `add` and
 * migrations. next-suite never reads it while the project runs.
 */
export const createProjectManifest = ({
  cliVersion,
  createdAt,
  plugins,
  answers,
}: ProjectManifestInput): string => {
  const manifest = {
    cli: cliVersion,
    contract: CONTRACT_VERSION,
    createdAt: createdAt.toISOString(),
    plugins: plugins.map(({ manifest: plugin }) => ({
      name: plugin.name,
      source: 'builtin',
      version: plugin.version,
    })),
    answers: answersByName(answers),
  }
  return `${JSON.stringify(manifest, null, 2)}\n`
}
