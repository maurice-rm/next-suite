import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { isDeepStrictEqual } from 'node:util'

import { readTextIfPresent } from '../file-system/read-text-if-present.ts'
import { applyFileChanges } from '../project-config/apply-file-changes.ts'
import {
  findUncommittedPaths,
  lastCommitOf,
  readCommittedFiles,
  saveUncommittedChanges,
} from '../project-config/git-repository.ts'
import {
  hashFileContent,
  type LockFile,
  parseLockFile,
  renderLockFile,
} from '../project-config/lock-file.ts'
import { hasConflictMarkers } from '../project-config/merge-text.ts'
import {
  isInstallCommand,
  type PendingUpdate,
  readPendingUpdate,
  removePendingUpdate,
  writePendingUpdate,
} from '../project-config/pending-update.ts'
import {
  type FileChange,
  planFileUpdates,
  type UpdateReport,
} from '../project-config/plan-file-updates.ts'
import { ProjectConfigError } from '../project-config/project-config-error.ts'
import { PROJECT_PATHS } from '../project-config/project-paths.ts'
import { PROJECT_FILES } from '../project-model/project.ts'
import type { BuiltInAssets } from './built-in-assets.ts'
import {
  warnAboutChangedPlugins,
  warnAboutLockDrift,
  warnAboutRegeneratedPlugins,
} from './compare-with-lock.ts'
import { formatLikeTheProject } from './format-like-the-project.ts'
import { generateOldOutput } from './generate-old-output.ts'
import { generatedFilesOf, generationFilesOf } from './generated-files.ts'
import { type ConfigPlanEnvironment, planFromConfig } from './plan-from-config.ts'
import type { ProjectPlan } from './project-plan.ts'
import type { PublishedGeneratorRunner } from './run-published-generator.ts'

const INPUT_PREFIX = `${PROJECT_PATHS.inputDirectory}/`
/** The settings that cannot change once a project is created. */
const FIXED_SETTINGS = ['srcDir', 'importAlias'] as const

/** What an update needs from outside: the plan environment and the published versions. */
export type UpdateEnvironment = Omit<ConfigPlanEnvironment, 'assets'> & {
  loadAssets: () => Promise<BuiltInAssets>
  runPublishedGenerator: PublishedGeneratorRunner
}

/** How an update runs: over uncommitted changes, and whether it writes anything. */
export type UpdateOptions = { force: boolean; dryRun: boolean }

/** What an update did, or would do in a dry run, and what to know about it. */
export type UpdateOutcome = {
  report: UpdateReport
  warnings: string[]
  notes: string[]
  /** `pending` when merge conflicts wait for `update --continue`. */
  state: 'dry-run' | 'done' | 'pending'
}

/** The install an update runs once it is complete, or nothing when the dependencies stayed. */
type Install = PendingUpdate['install']

/** Whether a path is an input of the generation, which may be changed when an update starts. */
const isInput = (path: string): boolean =>
  path === PROJECT_PATHS.config || path.startsWith(INPUT_PREFIX)

/**
 * Fails while uncommitted changes outside the config and `next-suite/` would mix with the update;
 * with `force`, records them in a commit object first and answers a note how to get them back.
 */
const checkUncommitted = async (root: string, { force }: UpdateOptions): Promise<string[]> => {
  const uncommitted = (await findUncommittedPaths(root)).filter((path) => !isInput(path))
  if (uncommitted.length === 0) {
    return []
  }
  if (!force) {
    throw new ProjectConfigError(
      `commit or stash your changes first, or pass --force: ${uncommitted.join(', ')}`,
    )
  }
  const saved = await saveUncommittedChanges(root)
  return saved === undefined
    ? []
    : [
        `your uncommitted changes to tracked files are saved in ${saved}; \`git stash apply ${saved}\` brings them back`,
      ]
}

/** The lock as committed, and the commit that last changed it. */
const readCommittedLock = async (root: string): Promise<{ lock: LockFile; commit: string }> => {
  const commit = await lastCommitOf(root, PROJECT_PATHS.lock)
  if (commit === undefined) {
    throw new ProjectConfigError(
      `commit ${PROJECT_PATHS.lock} first: an update generates the old output from the commit that last changed it`,
    )
  }
  const files = await readCommittedFiles(root, {
    commit,
    paths: [PROJECT_PATHS.lock],
  })
  const text = files.get(PROJECT_PATHS.lock) ?? ''
  return {
    lock: parseLockFile(text, `${PROJECT_PATHS.lock} in commit ${commit}`),
    commit,
  }
}

const lockOfPlan = (plan: ProjectPlan): LockFile =>
  parseLockFile(generationFilesOf(plan).get(PROJECT_PATHS.lock) ?? '', PROJECT_PATHS.lock)

const assertFixedSettings = (old: LockFile, next: LockFile): void => {
  const changed = FIXED_SETTINGS.filter((setting) => old.project[setting] !== next.project[setting])
  if (changed.length > 0) {
    throw new ProjectConfigError(
      `${PROJECT_PATHS.config} changes ${changed.join(' and ')}, which cannot change once the project is created; set ${changed.map((setting) => `${setting}: ${JSON.stringify(old.project[setting])}`).join(' and ')} again`,
    )
  }
}

/** The object a package.json holds; an empty one when it is missing or no JSON object. */
const parsePackageJson = (text: string | undefined): Record<string, unknown> => {
  try {
    const value: unknown = JSON.parse(text ?? '{}')
    return typeof value === 'object' && value !== null ? { ...value } : {}
  } catch (error) {
    if (error instanceof SyntaxError) {
      return {}
    }
    throw error
  }
}

/** The scripts of a package.json, by name. */
const scriptsOf = (packageJson: string | undefined): Set<string> => {
  const { scripts } = parsePackageJson(packageJson)
  return new Set(typeof scripts === 'object' && scripts !== null ? Object.keys(scripts) : [])
}

/** The dependencies a package.json names, for telling whether an install is due. */
const dependenciesOf = (packageJson: string | undefined) => {
  const { dependencies, devDependencies } = parsePackageJson(packageJson)
  return { dependencies, devDependencies }
}

const installOf = async (
  root: string,
  { changes, plan }: { changes: readonly FileChange[]; plan: ProjectPlan },
): Promise<Install> => {
  const change = changes.find(({ path }) => path === PROJECT_FILES.packageJson)
  if (change === undefined) {
    return null
  }
  const before = await readTextIfPresent(join(root, PROJECT_FILES.packageJson))
  if (isDeepStrictEqual(dependenciesOf(before), dependenciesOf(change.content))) {
    return null
  }
  const command = plan.packageManager ?? plan.projectPackageManager
  return isInstallCommand(command) ? { command, args: plan.installArgs } : null
}

const runInstall = async (
  environment: Pick<UpdateEnvironment, 'runCommand'>,
  { root, install }: { root: string; install: Install },
): Promise<string[]> => {
  if (install === null) {
    return []
  }
  const line = [install.command, ...install.args].join(' ')
  const result = await environment.runCommand(install.command, install.args, root)
  return result.isSuccess
    ? [`installed the dependencies with \`${line}\``]
    : [`could not install the dependencies; run \`${line}\` yourself:\n${result.output.trim()}`]
}

/** The generation files with the lock's file hashes taken from the files as written. */
const generationOf = (
  plan: ProjectPlan,
  files: ReadonlyMap<string, string>,
): Record<string, string> => {
  const lock = lockOfPlan(plan)
  const hashes = Object.fromEntries(
    [...files]
      .sort(([left], [right]) => (left < right ? -1 : 1))
      .map(([path, content]) => [path, hashFileContent(content)]),
  )
  return {
    ...Object.fromEntries(generationFilesOf(plan)),
    [PROJECT_PATHS.lock]: renderLockFile({ ...lock, files: hashes }),
  }
}

const writeGeneration = async (root: string, generation: Readonly<Record<string, string>>) => {
  for (const [path, content] of Object.entries(generation)) {
    await writeFile(join(root, path), content)
  }
}

/**
 * Updates a project to its `next-suite.config.ts`. The old output is generated once more from the
 * commit that last changed the lock, the new one from the config; both are formatted the way the
 * project formatted its files, and each file of the working tree takes the difference by a
 * three-way merge. Without merge conflicts the lock and the registry types are written and the
 * dependencies installed when they changed; with merge conflicts both wait in
 * `.next-suite/pending-update.json` for `update --continue`. A dry run writes nothing.
 *
 * @throws ProjectConfigError outside Git, over uncommitted changes without `force`, while an
 * update is pending, without a committed lock, or for a config that changes `srcDir` or
 * `importAlias`.
 */
export const updateProject = async (
  environment: UpdateEnvironment,
  { root, options }: { root: string; options: UpdateOptions },
): Promise<UpdateOutcome> => {
  if ((await readPendingUpdate(root)) !== undefined) {
    throw new ProjectConfigError(
      `an update waits for its merge conflicts to be resolved; resolve them and run \`next-suite update --continue\`, or discard it with \`git checkout -- .\` and by deleting ${PROJECT_PATHS.pendingUpdate}`,
    )
  }
  const notes = options.dryRun ? [] : await checkUncommitted(root, options)
  const { lock, commit } = await readCommittedLock(root)
  const assets = await environment.loadAssets()
  const planEnvironment = { ...environment, assets }
  const old = await generateOldOutput({
    environment: planEnvironment,
    projectDirectory: root,
    lock,
    lockCommit: commit,
  })
  const next = await planFromConfig(planEnvironment, {
    configPath: join(root, PROJECT_PATHS.config),
    projectDirectory: root,
  })
  assertFixedSettings(lock, lockOfPlan(next.plan))
  const nextScripts = next.plan.postSteps.map(({ script }) => script)
  const oldPackageScripts = scriptsOf(old.files.get(PROJECT_FILES.packageJson))
  const aligned = await formatLikeTheProject({
    old: old.files,
    next: generatedFilesOf(next.plan),
    lockHashes: lock.files,
    oldScripts:
      old.plan?.plan.postSteps.map(({ script }) => script) ??
      nextScripts.filter((script) => oldPackageScripts.has(script)),
    nextScripts,
    projectDirectory: root,
    packageManager: next.plan.projectPackageManager,
    runCommand: environment.runCommand,
  })
  const warnings = [
    ...old.warnings,
    ...warnAboutRegeneratedPlugins(lock, old.plan?.external ?? []),
    ...aligned.warnings,
    ...warnAboutLockDrift(lock, aligned.old),
    ...warnAboutChangedPlugins(lock, next.external),
  ]
  const { report, changes } = await planFileUpdates(root, {
    old: aligned.old,
    next: aligned.next,
    lockHashes: lock.files,
  })
  if (options.dryRun) {
    return { report, warnings, notes, state: 'dry-run' }
  }
  const install = await installOf(root, { changes, plan: next.plan })
  await applyFileChanges(root, changes)
  const generation = generationOf(next.plan, aligned.next)
  if (report.mergeConflicts.length > 0) {
    await writePendingUpdate(root, {
      generation,
      mergeConflicts: report.mergeConflicts.flatMap((conflict) =>
        conflict.kind === 'text' ? [conflict.path] : [],
      ),
      install,
    })
    return { report, warnings, notes, state: 'pending' }
  }
  await writeGeneration(root, generation)
  return {
    report,
    warnings,
    notes: [...notes, ...(await runInstall(environment, { root, install }))],
    state: 'done',
  }
}

/** The files that still hold merge conflict markers. */
const findUnresolved = async (root: string, paths: readonly string[]): Promise<string[]> => {
  const unresolved: string[] = []
  for (const path of paths) {
    const content = await readTextIfPresent(join(root, path))
    if (content !== undefined && hasConflictMarkers(content)) {
      unresolved.push(path)
    }
  }
  return unresolved
}

/**
 * Completes an update that left merge conflicts, once no file holds a merge conflict marker any more: writes
 * the lock and the registry types it prepared and runs the install it recorded. Answers notes
 * about the install.
 *
 * @throws ProjectConfigError when no update is pending or a file still holds conflict markers.
 */
export const continueUpdate = async (
  environment: Pick<UpdateEnvironment, 'runCommand'>,
  root: string,
): Promise<string[]> => {
  const pending = await readPendingUpdate(root)
  if (pending === undefined) {
    throw new ProjectConfigError('no update waits for --continue; run `next-suite update`')
  }
  const unresolved = await findUnresolved(root, pending.mergeConflicts)
  if (unresolved.length > 0) {
    throw new ProjectConfigError(
      `these files still hold merge conflict markers; resolve them, then run \`next-suite update --continue\` again: ${unresolved.join(', ')}`,
    )
  }
  await writeGeneration(root, pending.generation)
  await removePendingUpdate(root)
  return runInstall(environment, {
    root,
    install: pending.install,
  })
}
