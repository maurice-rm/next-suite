import * as p from "@clack/prompts";

import type { ProjectConfig } from "@/core/types";

import { fixProject } from "./fix";
import { createInitialCommit, initGit } from "./git";
import { installDependencies } from "./install";
import { generateMigrations } from "./migrations";
import { isCommandAvailable } from "./run";
import { initShadcn } from "./shadcn";

/**
 * A human-readable reason for a failed `run`, trimmed. Prefers the tool's
 * stderr, then stdout, then execa's message — so a stderr-less failure (e.g. a
 * subprocess killed by signal or timeout) still reports something. Empty when
 * no candidate carries text.
 */
const failureReason = (error: unknown): string => {
  const e = error as {
    stderr?: unknown;
    stdout?: unknown;
    shortMessage?: unknown;
    message?: unknown;
  } | null;
  for (const candidate of [e?.stderr, e?.stdout, e?.shortMessage, e?.message]) {
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
const step = async (
  start: string,
  done: string,
  failed: string,
  action: () => Promise<void>,
): Promise<boolean> => {
  const spinner = p.spinner();
  spinner.start(start);
  try {
    await action();
    spinner.stop(done);
    return true;
  } catch (error) {
    spinner.error(failed);
    const reason = failureReason(error);
    if (reason) p.log.message(reason);
    return false;
  }
};

/**
 * Run the post-generation steps (best-effort, in order): initialize git,
 * install dependencies, initialize shadcn/ui, fix the project, then create
 * the initial commit. A failing step warns and the rest still run — the
 * generated project is never invalidated.
 *
 * @param config - The resolved project configuration.
 */
export const runPostSteps = async (config: ProjectConfig): Promise<void> => {
  const shadcn = config.shadcn;
  const usesShadcn = config.componentLibrary === "shadcn" && !!shadcn;
  const pmAvailable =
    !(config.install || usesShadcn) ||
    (await isCommandAvailable(config.packageManager));
  if (!pmAvailable) {
    p.log.warn(
      `${config.packageManager} was not found on your PATH — skipping install and shadcn setup. Install it, then run \`${config.packageManager} install\`.`,
    );
  }

  let gitReady = false;
  if (config.git) {
    gitReady = await step(
      "Initializing git repository…",
      "Initialized git repository",
      "Could not initialize git repository",
      () => initGit(config.targetDir),
    );
  }
  let installed = false;
  if (config.install && pmAvailable) {
    installed = await step(
      `Installing dependencies (${config.packageManager})…`,
      "Installed dependencies",
      `Could not install — run \`${config.packageManager} install\` yourself`,
      () => installDependencies(config.targetDir, config.packageManager),
    );
  }
  if (usesShadcn && pmAvailable) {
    await step(
      "Setting up shadcn/ui…",
      "Set up shadcn/ui",
      "Could not set up shadcn/ui — run `shadcn init` yourself",
      () => initShadcn(config.targetDir, config.packageManager, shadcn),
    );
  }
  if (
    installed &&
    config.database?.orm === "drizzle" &&
    config.production !== undefined
  ) {
    await step(
      "Generating initial migration…",
      "Generated initial migration",
      `Could not generate the migration — run \`${config.packageManager} run db:generate\` yourself, or the first production deploy starts with an empty database`,
      () => generateMigrations(config.targetDir, config.packageManager),
    );
  }
  if (installed) {
    await step(
      "Fixing files…",
      "Fixed files",
      `Could not fix files — run \`${config.packageManager} run fix\` yourself`,
      () => fixProject(config.targetDir, config.packageManager),
    );
  }
  if (config.git && gitReady) {
    await step(
      "Creating initial commit…",
      "Created initial commit",
      "Could not create initial commit",
      () => createInitialCommit(config.targetDir),
    );
  }
};
