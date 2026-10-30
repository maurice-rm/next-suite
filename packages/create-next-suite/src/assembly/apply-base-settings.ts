import type { Project } from '../project-model/project.ts'
import { ProjectError } from '../project-model/project-error.ts'
import { aliasTarget } from '../project-model/source-path.ts'

/** The name the base project has until the core replaces it with the project's. */
const BASE_PROJECT_NAME = 'next-suite-app'
const BASE_ALIAS = '@/*'
const START_PAGE = '@/app/page.tsx'
const SETTINGS_ORIGIN = 'base-settings'
const AGENTS_CATEGORY = 'agents'
/** The React Compiler needs its Babel plugin (Next.js docs 16.4, reactCompiler). */
const REACT_COMPILER_PLUGIN = 'babel-plugin-react-compiler'
const REACT_COMPILER_VERSION = '1.0.0'

/** The settings of the base project, which the core applies to its files. */
export type BaseSettings = {
  /** The name of the project, also the name of its directory. */
  projectName: string
  /** The import alias, such as `@/*` or `~/*`. */
  importAlias: string
  /** Whether the code lies inside `src/`. */
  isSrcDirectory: boolean
  usesReactCompiler: boolean
  usesCacheComponents: boolean
}

const renameStartPage = (project: Project, projectName: string): void => {
  project.module(START_PAGE).editRaw(({ text, code }) => {
    const heading = `>${BASE_PROJECT_NAME}<`
    const start = text.indexOf(heading)
    if (start === -1) {
      throw new ProjectError(`${project.diskPath(START_PAGE)} does not show ${BASE_PROJECT_NAME}`)
    }
    code.overwrite(start + 1, start + heading.length - 1, projectName)
  })
}

const renameProject = (project: Project, projectName: string): void => {
  project.packageJson().setName(projectName)
  const title = project.layout().metadata().object('title')
  title.set('default', JSON.stringify(projectName))
  title.set('template', JSON.stringify(`%s | ${projectName}`))
  project.readme().setTitle(projectName)
  renameStartPage(project, projectName)
}

/**
 * Applies the base settings to the base files, before any plugin runs: the project name replaces
 * the base's, the import alias and source directory go into `tsconfig.json`, and `next.config.ts`
 * gets the agent rules turned off unless a plugin of the agents category runs, then the React
 * Compiler and Cache Components (Next.js docs 16.4, next.config.js reference).
 *
 * @param categories - The categories of the plugins that run.
 * @throws ProjectError when a base file lacks what a setting changes.
 */
export const applyBaseSettings = (
  project: Project,
  settings: BaseSettings,
  categories: ReadonlySet<string>,
): void => {
  renameProject(project, settings.projectName)
  if (settings.importAlias !== BASE_ALIAS || settings.isSrcDirectory) {
    project.tsconfig().setSourceAlias(settings.importAlias, aliasTarget(settings.isSrcDirectory))
  }
  const nextConfig = project.nextConfig()
  if (!categories.has(AGENTS_CATEGORY)) {
    nextConfig.setOption('agentRules', 'false')
  }
  if (settings.usesReactCompiler) {
    project
      .packageJson()
      .addDevDependency(REACT_COMPILER_PLUGIN, REACT_COMPILER_VERSION, SETTINGS_ORIGIN)
    nextConfig.setOption('reactCompiler', 'true')
  }
  if (settings.usesCacheComponents) {
    nextConfig.setOption('cacheComponents', 'true')
    nextConfig.setOption('partialPrefetching', 'true')
  }
}
