import { execa } from "execa";

import { isCommandAvailable, run, type RunOptions } from "./run";

const DEFAULT_BRANCH = "main";
const INITIAL_COMMIT_MESSAGE = "chore: initial commit";

/** Git sub-process env vars that would tie the new repo to a parent git context. */
const GIT_CONTEXT_VARS = [
  "GIT_DIR",
  "GIT_WORK_TREE",
  "GIT_INDEX_FILE",
  "GIT_OBJECT_DIRECTORY",
  "GIT_ALTERNATE_OBJECT_DIRECTORIES",
  "GIT_COMMON_DIR",
];

const cleanGitEnv = (): NodeJS.ProcessEnv => {
  const env = { ...process.env };
  for (const key of GIT_CONTEXT_VARS) delete env[key];
  return env;
};

const gitOptions = (targetDir: string): RunOptions => ({
  cwd: targetDir,
  env: cleanGitEnv(),
  replaceEnv: true,
});

/** Initialize a git repository in the project (no staging, no commit). */
export const initGit = async (targetDir: string): Promise<void> => {
  if (!(await isCommandAvailable("git")))
    throw new Error("Git is not installed.");
  await run(
    "git",
    ["-c", `init.defaultBranch=${DEFAULT_BRANCH}`, "init"],
    gitOptions(targetDir),
  );
};

/** Committer identity used only when the machine has none configured. */
const FALLBACK_COMMITTER = {
  name: "create-next-suite",
  email: "create-next-suite@users.noreply.github.com",
};

/**
 * Whether a committer identity is configured (locally or globally). Bypasses
 * `run` like {@link isCommandAvailable}: the probe must never throw and only needs
 * the exit code and value.
 */
const hasGitIdentity = async (targetDir: string): Promise<boolean> => {
  const { exitCode, stdout } = await execa("git", ["config", "user.email"], {
    cwd: targetDir,
    reject: false,
  });
  return exitCode === 0 && stdout.trim().length > 0;
};

/** Stage everything and create the scaffold's initial commit. */
export const createInitialCommit = async (targetDir: string): Promise<void> => {
  const options = gitOptions(targetDir);
  await run("git", ["add", "-A"], options);
  const identity = (await hasGitIdentity(targetDir))
    ? []
    : [
        "-c",
        `user.name=${FALLBACK_COMMITTER.name}`,
        "-c",
        `user.email=${FALLBACK_COMMITTER.email}`,
      ];
  await run(
    "git",
    [...identity, "commit", "--no-verify", "-m", INITIAL_COMMIT_MESSAGE],
    options,
  );
};
