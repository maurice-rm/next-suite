import { execa } from "execa";

/** Cap on a single command's run time: generous for slow installs, never forever. */
const DEFAULT_RUN_TIMEOUT_MS = 600_000;

export interface RunOptions {
  cwd: string;
  /** Extends process.env unless {@link replaceEnv} is set. */
  env?: NodeJS.ProcessEnv;
  replaceEnv?: boolean;
  timeout?: number;
}

/**
 * Run an external command, capturing its output so a tool's own chatter
 * (shadcn's checks, a package manager's progress) doesn't garble the spinner.
 * Throws on a non-zero exit or timeout; the thrown error carries the captured
 * stdout/stderr so the caller can surface why it failed. A timeout guards
 * against a hung subprocess (stalled download, an unexpected prompt) freezing
 * the CLI under a spinner.
 *
 * @param command - The executable to run.
 * @param args - Its arguments.
 * @param options - Working directory, environment, and timeout.
 */
export const run = async (
  command: string,
  args: string[],
  options: RunOptions,
): Promise<void> => {
  await execa(command, args, {
    cwd: options.cwd,
    env: options.env,
    extendEnv: !options.replaceEnv,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
    timeout: options.timeout ?? DEFAULT_RUN_TIMEOUT_MS,
  });
};

/**
 * Whether a command is available on the PATH (platform-aware, never throws).
 *
 * @param command - The command name to probe.
 * @returns `true` when the command resolves.
 */
export const isCommandAvailable = async (command: string): Promise<boolean> => {
  const probe = process.platform === "win32" ? "where" : "which";
  const { exitCode } = await execa(probe, [command], { reject: false });
  return exitCode === 0;
};
