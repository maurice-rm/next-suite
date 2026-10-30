import type { AnswerValue } from '../answers/answers.ts'
import type { CompositionValues } from './merge-contributions.ts'
import { type KeyValue, keyValuePairs } from './merge-entries.ts'
import type { ProjectValues } from './project-values.ts'

/** What a template knows about the run besides the merged contributions. */
export type RunValues = {
  project: ProjectValues
  settings: Readonly<Record<string, AnswerValue>>
  /** The answers to the options of the plugin whose template renders. */
  options: Readonly<Record<string, AnswerValue>>
}

/** Values only the core reads, to write package.json and the instrumentation files. */
type CoreValueName =
  | 'scripts'
  | 'fields'
  | 'dependencies'
  | 'devDependencies'
  | 'instrumentation'
  | 'instrumentationClient'
  | 'generatedDirs'

/**
 * The merged contributions as templates read them: an ordered map is a list of `{ key, value }`
 * or, where the value is a list, `{ key, values }`; a plain list is an array.
 */
export type TemplateValues = Omit<CompositionValues, CoreValueName> & { scripts: KeyValue[] }

/** The merged contributions a template may read, without those only the core reads. */
export const templateValues = (values: CompositionValues): TemplateValues => ({
  scripts: keyValuePairs(new Map(Object.entries(values.scripts))),
  env: values.env,
  layoutMetadata: values.layoutMetadata,
  allowedBuilds: values.allowedBuilds,
  deniedBuilds: values.deniedBuilds,
  cssImports: values.cssImports,
  prettierPlugins: values.prettierPlugins,
  ciChecks: values.ciChecks,
  agents: values.agents,
  lintStaged: values.lintStaged,
  gitignore: values.gitignore,
  readme: values.readme,
  nextConfig: values.nextConfig,
  rootProviders: values.rootProviders,
  bodyEnd: values.bodyEnd,
  tsconfig: values.tsconfig,
  lintIgnores: values.lintIgnores,
  knip: values.knip,
  container: values.container,
  csp: values.csp,
  health: values.health,
  testSetup: values.testSetup,
  logRedact: values.logRedact,
})

/**
 * Everything a template reads; the run values keep their names whatever a template value is called.
 */
export const templateContext = (
  values: TemplateValues,
  run: RunValues,
): TemplateValues & RunValues => ({ ...values, ...run })
