import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import semver from 'semver'

import { findUnsafePathProblem } from '../file-system/find-unsafe-path-problem.ts'
import { readCommittedFiles } from '../project-config/git-repository.ts'
import { type LockFile, parseLockFile } from '../project-config/lock-file.ts'
import { ProjectConfigError } from '../project-config/project-config-error.ts'
import { CLI_PACKAGE, PROJECT_PATHS } from '../project-config/project-paths.ts'
import { generatedFilesOf } from './generated-files.ts'
import { type ConfigPlan, type ConfigPlanEnvironment, planFromConfig } from './plan-from-config.ts'
import type { PublishedGeneratorRunner } from './run-published-generator.ts'

const SNAPSHOT_DIRECTORY = 'project'
const OUTPUT_DIRECTORY = 'output'
/** How many characters of a failed run's output a warning quotes. */
const MAX_REASON_LENGTH = 300

/** The output the last generation wrote, regenerated, and what to know about it. */
export type OldOutput = {
  files: Map<string, string>
  /** The plan, when the running create-next-suite made the output. */
  plan: ConfigPlan | undefined
  warnings: string[]
}

type OldGeneration = {
  environment: ConfigPlanEnvironment & {
    runPublishedGenerator: PublishedGeneratorRunner
  }
  projectDirectory: string
  /** The lock of the last generation, as committed. */
  lock: LockFile
  /** The commit that last changed the lock, whose config and inputs the old output comes from. */
  lockCommit: string
}

/** Writes the config and inputs of the lock's commit into a directory of its own. */
const writeSnapshot = async (
  { projectDirectory, lockCommit }: OldGeneration,
  directory: string,
): Promise<string> => {
  const files = await readCommittedFiles(projectDirectory, {
    commit: lockCommit,
    paths: [PROJECT_PATHS.config, PROJECT_PATHS.inputDirectory],
  })
  if (!files.has(PROJECT_PATHS.config)) {
    throw new ProjectConfigError(
      `commit ${lockCommit}, which last changed ${PROJECT_PATHS.lock}, has no ${PROJECT_PATHS.config}`,
    )
  }
  for (const [path, content] of files) {
    await mkdir(dirname(join(directory, path)), { recursive: true })
    await writeFile(join(directory, path), content)
  }
  return join(directory, PROJECT_PATHS.config)
}

const reasonOf = (output: string): string => {
  const text = output.trim().replaceAll(/\s+/g, ' ')
  return text.length <= MAX_REASON_LENGTH ? text : `…${text.slice(-MAX_REASON_LENGTH)}`
}

/** The files a published version wrote into a directory, as its lock lists them. */
const readOutput = async (directory: string): Promise<Map<string, string>> => {
  const lockPath = join(directory, PROJECT_PATHS.lock)
  const lock = parseLockFile(await readFile(lockPath, 'utf8'), lockPath)
  const files = new Map<string, string>()
  for (const path of Object.keys(lock.files)) {
    const problem = findUnsafePathProblem(path)
    if (problem !== undefined) {
      throw new ProjectConfigError(`${lockPath} lists ${path}, which ${problem}`)
    }
    files.set(path, await readFile(join(directory, path), 'utf8'))
  }
  return files
}

/** Runs the version of the lock; answers its files, or why it could not run. */
const runRecordedVersion = async (
  { environment }: OldGeneration,
  {
    version,
    configPath,
    workDirectory,
  }: { version: string; configPath: string; workDirectory: string },
): Promise<{ files: Map<string, string> } | { problem: string }> => {
  if (semver.valid(version) !== version) {
    return {
      problem: `the lock names the version "${version}", which is no exact version`,
    }
  }
  const result = await environment.runPublishedGenerator({
    version,
    configPath,
    workDirectory,
    targetName: OUTPUT_DIRECTORY,
  })
  if (!result.isSuccess) {
    return { problem: reasonOf(result.output) }
  }
  return { files: await readOutput(join(workDirectory, OUTPUT_DIRECTORY)) }
}

const fallbackWarning = (version: string, running: string, problem: string): string =>
  `could not run ${CLI_PACKAGE}@${version}, which generated the project (${problem}); the old output comes from ${running} instead, so where ${running} changed a file you also changed, that change does not reach your file: check it with git diff after the update`

/**
 * Generates once more what the last generation wrote: with the config and the project's plugins
 * and overrides of the commit that last changed the lock, and with the version of
 * create-next-suite the lock names. The running version generates it in this process; another
 * version runs as published, through npm. When that version cannot run, such as offline without
 * it in npm's cache, the running version generates it instead, with a warning about what that
 * means.
 *
 * @throws ProjectConfigError when the lock's commit has no config.
 */
export const generateOldOutput = async (generation: OldGeneration): Promise<OldOutput> => {
  const { environment, projectDirectory, lock } = generation
  const workDirectory = await mkdtemp(join(tmpdir(), 'next-suite-old-'))
  try {
    const configPath = await writeSnapshot(generation, join(workDirectory, SNAPSHOT_DIRECTORY))
    const version = lock.generator.version
    const warnings: string[] = []
    if (version !== environment.cliVersion) {
      const recorded = await runRecordedVersion(generation, {
        version,
        configPath,
        workDirectory,
      })
      if ('files' in recorded) {
        return { files: recorded.files, plan: undefined, warnings }
      }
      warnings.push(fallbackWarning(version, environment.cliVersion, recorded.problem))
    }
    const plan = await planFromConfig(environment, {
      configPath,
      projectDirectory,
    })
    return { files: generatedFilesOf(plan.plan), plan, warnings }
  } finally {
    await rm(workDirectory, { recursive: true, force: true })
  }
}
