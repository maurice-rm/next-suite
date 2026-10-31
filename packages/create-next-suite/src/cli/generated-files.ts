import { PROJECT_PATHS } from '../project-config/project-paths.ts'
import type { ProjectPlan } from './project-plan.ts'

const GENERATOR_PREFIX = `${PROJECT_PATHS.generatorDirectory}/`
const INPUT_PREFIX = `${PROJECT_PATHS.inputDirectory}/`

/** Whether a planned file belongs to the project's own description: its config and inputs. */
const isProjectInput = (path: string): boolean =>
  path === PROJECT_PATHS.config || path.startsWith(INPUT_PREFIX)

/**
 * The files a plan generates, by path: everything but the config, the project's inputs under
 * `next-suite/` and what create-next-suite writes under `.next-suite/`. These are the files the
 * lock hashes and an update merges.
 */
export const generatedFilesOf = (plan: ProjectPlan): Map<string, string> =>
  new Map(
    plan.files
      .filter(({ path }) => !isProjectInput(path) && !path.startsWith(GENERATOR_PREFIX))
      .map(({ path, content }) => [path, content]),
  )

/** What a plan writes under `.next-suite/`: the lock and the registry types, by path. */
export const generationFilesOf = (plan: ProjectPlan): Map<string, string> =>
  new Map(
    plan.files
      .filter(({ path }) => path.startsWith(GENERATOR_PREFIX))
      .map(({ path, content }) => [path, content]),
  )
