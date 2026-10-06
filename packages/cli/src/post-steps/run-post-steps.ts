import * as p from "@clack/prompts";

import type { ProjectConfig, ShadcnOptions } from "@/core/types";

import { fixProject } from "./fix";
import { createInitialCommit, initGit } from "./git";
import { installDependencies } from "./install";
import { generateMigrations } from "./migrations";
import { isCommandAvailable } from "./run";
import { initShadcn } from "./shadcn";

interface StepMessages {
  start: string;
  done: string;
  failed: string;
}

// stderr first, then stdout, then execa's messages — so a stderr-less failure
// (e.g. a subprocess killed by signal or timeout) still reports something.
const FAILURE_REASON_FIELDS = ["stderr", "stdout", "shortMessage", "message"];

const readFailureReason = (error: unknown): string => {
  if (typeof error !== "object" || error === null) return "";
  for (const field of FAILURE_REASON_FIELDS) {
    const candidate: unknown = Reflect.get(error, field);
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }
  return "";
};

/**
 * Run one best-effort post-step under a spinner — a failure shows a red error
 * and continues.
 *
 * @returns Whether the step succeeded.
 */
const runStep = async (
  messages: StepMessages,
  action: () => Promise<void>,
): Promise<boolean> => {
  const spinner = p.spinner();
  spinner.start(messages.start);
  try {
    await action();
    spinner.stop(messages.done);
    return true;
  } catch (error) {
    spinner.error(messages.failed);
    const reason = readFailureReason(error);
    if (reason) p.log.message(reason);
    return false;
  }
};

const checkPackageManager = async (
  config: ProjectConfig,
  isPackageManagerNeeded: boolean,
): Promise<boolean> => {
  if (!isPackageManagerNeeded) return true;
  if (await isCommandAvailable(config.packageManager)) return true;
  p.log.warn(
    `${config.packageManager} was not found on your PATH — skipping install and shadcn setup. Install it, then run \`${config.packageManager} install\`.`,
  );
  return false;
};

const runGitInit = (config: ProjectConfig): Promise<boolean> =>
  runStep(
    {
      start: "Initializing git repository…",
      done: "Initialized git repository",
      failed: "Could not initialize git repository",
    },
    () => initGit(config.targetDir),
  );

const runInstall = (config: ProjectConfig): Promise<boolean> =>
  runStep(
    {
      start: `Installing dependencies (${config.packageManager})…`,
      done: "Installed dependencies",
      failed: `Could not install — run \`${config.packageManager} install\` yourself`,
    },
    () => installDependencies(config.targetDir, config.packageManager),
  );

const runShadcnInit = (
  config: ProjectConfig,
  shadcn: ShadcnOptions,
): Promise<boolean> =>
  runStep(
    {
      start: "Setting up shadcn/ui…",
      done: "Set up shadcn/ui",
      failed: "Could not set up shadcn/ui — run `shadcn init` yourself",
    },
    () => initShadcn(config.targetDir, config.packageManager, shadcn),
  );

const runMigrationGeneration = async (config: ProjectConfig): Promise<void> => {
  const orm = config.database?.orm;
  if (orm === undefined || config.production === undefined) return;
  await runStep(
    {
      start: "Generating initial migration…",
      done: "Generated initial migration",
      failed:
        "Could not generate the initial migration — create one yourself, or the first production deploy starts with an empty database",
    },
    () => generateMigrations(config.targetDir, config.packageManager, orm),
  );
};

const runFix = (config: ProjectConfig): Promise<boolean> =>
  runStep(
    {
      start: "Fixing files…",
      done: "Fixed files",
      failed: `Could not fix files — run \`${config.packageManager} run fix\` yourself`,
    },
    () => fixProject(config.targetDir, config.packageManager),
  );

const runInitialCommit = (config: ProjectConfig): Promise<boolean> =>
  runStep(
    {
      start: "Creating initial commit…",
      done: "Created initial commit",
      failed: "Could not create initial commit",
    },
    () => createInitialCommit(config.targetDir),
  );

/**
 * Run the post-generation steps (best-effort, in order): initialize git,
 * install dependencies, initialize shadcn/ui, generate the initial migration,
 * fix the project, then create the initial commit. A failing step warns and
 * the rest still run — the generated project is never invalidated.
 */
export const runPostSteps = async (config: ProjectConfig): Promise<void> => {
  const { shadcn } = config;
  const canUsePackageManager = await checkPackageManager(
    config,
    config.install || shadcn !== undefined,
  );

  const isGitReady = config.git && (await runGitInit(config));
  const isInstalled =
    config.install && canUsePackageManager && (await runInstall(config));
  const isShadcnInstalled =
    shadcn !== undefined &&
    canUsePackageManager &&
    (await runShadcnInit(config, shadcn));
  if (isInstalled) await runMigrationGeneration(config);
  // shadcn init installs the dependencies itself, even with --no-install.
  if (isInstalled || isShadcnInstalled) await runFix(config);
  if (isGitReady) await runInitialCommit(config);
};
